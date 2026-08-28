import * as path from "path";
import { LIMITS } from "../config/constants.js";
import { interpolate } from "../utils/interpolate.js";
import { formatEmailHtml } from "../utils/format-email.js";
import { logger } from "../utils/logger.js";
import { classifyFailure } from "../integrations/email/classify-failure.js";
import type { EmailProvider } from "../integrations/email/provider.js";
import type { CandidateProfile } from "../modules/settings/settings.schema.js";

// ---------------------------------------------------------------------------
// Dependency ports (injected — keeps the job unit-testable without a DB)
// ---------------------------------------------------------------------------

export interface ContactRow {
  id: number;
  companyName: string;
  location: string | null;
  email: string;
  status: string;
  retryCount: number;
  lastContactedAt?: Date | null;
  sentAt?: Date | null;
}

export interface CampaignPort {
  getContact(id: number): Promise<ContactRow | null>;
  getSettings(): Promise<{ mode: string; testEmail: string | null } | null>;
  setState(state: "RUNNING" | "PAUSED" | "STOPPED" | "IDLE"): Promise<unknown>;
  markContactProcessing(id: number): Promise<void>;
  markContactSent(id: number, sentAt: Date): Promise<void>;
  markContactBounced(id: number): Promise<void>;
  markContactFailed(id: number): Promise<void>;
  scheduleRetry(id: number, retryCount: number, nextRetryAt: Date): Promise<void>;
  resetContactPending(id: number): Promise<void>;
  incQuota(date: Date): Promise<unknown>;
}

export interface TemplatePort {
  pickRandomActive(options?: { isFollowup?: boolean }): Promise<{ id: number; subject: string; body: string } | undefined | null>;
}

export interface SettingsPort {
  getGeminiKey(): Promise<string>;
  getCandidateProfile(): Promise<CandidateProfile>;
  buildSignature(profile: CandidateProfile): string;
  getResumePath(): Promise<string | null>;
}

export interface PersonalizeFn {
  (input: {
    template: { subject: string; body: string };
    vars: { company: string; location: string; candidate: { name: string; email?: string } };
    apiKey?: string;
  }): Promise<{ subject: string; body: string; aiUsed: boolean }>;
}

export interface LogInput {
  contactId: number;
  templateId: number | null;
  subject: string;
  body: string;
  mode: string;
  status: string;
  failureType?: "TEMPORARY" | "PERMANENT";
  errorCode?: string;
  errorMessage?: string;
  retryCount?: number;
  nextRetryAt?: Date | null;
  aiUsed: boolean;
  sentAt?: Date | null;
}

export interface LogsPort {
  create(log: LogInput): Promise<void>;
}

export interface SendEmailDeps {
  campaign: CampaignPort;
  templates: TemplatePort;
  settings: SettingsPort;
  personalize: PersonalizeFn;
  getProvider: () => Promise<EmailProvider>;
  logs: LogsPort;
  now?: () => Date;
}

export type SendOutcome =
  | "sent"
  | "draft"
  | "retry"
  | "failed"
  | "bounced"
  | "paused"
  | "skipped";

export interface SendResult {
  outcome: SendOutcome;
}

// ---------------------------------------------------------------------------
// The send-email job — full decision tree per spec §4
// ---------------------------------------------------------------------------

export async function sendEmailJob(contactId: number, deps: SendEmailDeps): Promise<SendResult> {
  const now = deps.now?.() ?? new Date();

  const contact = await deps.campaign.getContact(contactId);
  if (!contact) {
    logger.warn({ contactId }, "send-email: contact not found");
    return { outcome: "skipped" };
  }

  const settings = await deps.campaign.getSettings();
  const mode = settings?.mode ?? "DRAFT";

  // Validate TEST mode config BEFORE consuming the contact.
  if (mode === "TEST" && !settings?.testEmail) {
    logger.warn({ contactId }, "send-email: TEST mode but no testEmail configured");
    await deps.logs.create({
      contactId,
      templateId: null,
      subject: "",
      body: "",
      mode,
      status: "SKIPPED",
      errorMessage: "TEST mode enabled but no test email configured",
      aiUsed: false,
    });
    return { outcome: "skipped" };
  }

  await deps.campaign.markContactProcessing(contactId);

  // Pick a template: first-time contacts never get follow-up templates
  const isFollowup = !!(contact.sentAt || contact.lastContactedAt);
  const template = await deps.templates.pickRandomActive({ isFollowup });
  if (!template) {
    logger.warn({ contactId }, "send-email: no active template available");
    await deps.logs.create({
      contactId,
      templateId: null,
      subject: "",
      body: "",
      mode,
      status: "SKIPPED",
      errorMessage: "No active template available",
      aiUsed: false,
    });
    await deps.campaign.resetContactPending(contactId);
    return { outcome: "skipped" };
  }

  // Build the fully-rendered template (signature/name/company/location), then
  // let Gemini personalize on top (with template fallback inside personalize()).
  const profile = await deps.settings.getCandidateProfile();
  const signature = deps.settings.buildSignature(profile);
  const userRole = profile.role?.trim() || "the open role";
  const userExperience = profile.experience?.trim() || "";
  const userSkills = profile.skills && profile.skills.length > 0 ? profile.skills.join(", ") : "";

  const flatVars: Record<string, string> = {
    company: contact.companyName,
    location: contact.location ?? "",
    candidateName: profile.name ?? "",
    candidateEmail: profile.email ?? "",
    role: userRole,
    targetRole: userRole,
    experience: userExperience,
    skills: userSkills,
    signature,
  };
  const rendered = {
    subject: interpolate(template.subject, flatVars),
    body: interpolate(template.body, flatVars),
  };

  const apiKey = await deps.settings.getGeminiKey();
  const personalized = await deps.personalize({
    template: rendered,
    vars: {
      company: contact.companyName,
      location: contact.location ?? "",
      candidate: { name: profile.name ?? "", email: profile.email },
    },
    apiKey: apiKey || undefined,
  });

  const subject = personalized.subject;
  const body = personalized.body;
  const aiUsed = personalized.aiUsed;

  // DRAFT mode: generate + log only, do not send; leave contact PENDING.
  if (mode === "DRAFT") {
    await deps.logs.create({
      contactId,
      templateId: template.id,
      subject,
      body,
      mode,
      status: "GENERATED",
      aiUsed,
    });
    await deps.campaign.resetContactPending(contactId);
    return { outcome: "draft" };
  }

  // TEST → testEmail; LIVE → real recipient.
  const recipient = mode === "TEST" ? (settings!.testEmail as string) : contact.email;

  const resumePath = await deps.settings.getResumePath();
  const attachments = resumePath
    ? [{ filename: path.basename(resumePath), path: resumePath }]
    : undefined;

  try {
    const provider = await deps.getProvider();
    await provider.send({ to: recipient, subject, html: formatEmailHtml(body), attachments });

    await deps.logs.create({
      contactId,
      templateId: template.id,
      subject,
      body,
      mode,
      status: "SENT",
      aiUsed,
      sentAt: now,
    });
    await deps.campaign.markContactSent(contactId, now);
    await deps.campaign.incQuota(now);
    return { outcome: "sent" };
  } catch (err) {
    const classified = classifyFailure(err);

    // Gmail daily limit / quota → pause campaign, DO NOT change contact status.
    if (classified.isQuota) {
      logger.warn({ contactId }, "send-email: quota reached — pausing campaign");
      await deps.campaign.setState("PAUSED");
      await deps.logs.create({
        contactId,
        templateId: template.id,
        subject,
        body,
        mode,
        status: "SKIPPED",
        failureType: classified.type,
        errorCode: classified.code,
        errorMessage: classified.message,
        aiUsed,
      });
      await deps.campaign.resetContactPending(contactId);
      return { outcome: "paused" };
    }

    // Permanent failure → BOUNCED, never retried.
    if (classified.type === "PERMANENT") {
      await deps.campaign.markContactBounced(contactId);
      await deps.logs.create({
        contactId,
        templateId: template.id,
        subject,
        body,
        mode,
        status: "BOUNCED",
        failureType: "PERMANENT",
        errorCode: classified.code,
        errorMessage: classified.message,
        aiUsed,
      });
      return { outcome: "bounced" };
    }

    // Temporary failure → retry schedule, then FAILED after MAX_RETRIES.
    const newRetryCount = contact.retryCount + 1;
    if (newRetryCount > LIMITS.MAX_RETRIES) {
      await deps.campaign.markContactFailed(contactId);
      await deps.logs.create({
        contactId,
        templateId: template.id,
        subject,
        body,
        mode,
        status: "FAILED",
        failureType: "TEMPORARY",
        errorCode: classified.code,
        errorMessage: classified.message,
        retryCount: newRetryCount,
        aiUsed,
      });
      return { outcome: "failed" };
    }

    const delayMs = LIMITS.RETRY_DELAYS_MS[newRetryCount - 1];
    const nextRetryAt = new Date(now.getTime() + delayMs);
    await deps.campaign.scheduleRetry(contactId, newRetryCount, nextRetryAt);
    await deps.logs.create({
      contactId,
      templateId: template.id,
      subject,
      body,
      mode,
      status: "RETRY_SCHEDULED",
      failureType: "TEMPORARY",
      errorCode: classified.code,
      errorMessage: classified.message,
      retryCount: newRetryCount,
      nextRetryAt,
      aiUsed,
    });
    return { outcome: "retry" };
  }
}
