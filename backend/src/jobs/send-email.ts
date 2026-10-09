import { LIMITS } from "../config/constants.js";
import { interpolate } from "../utils/interpolate.js";
import { formatEmailHtml } from "../utils/format-email.js";
import { logger } from "../utils/logger.js";
import { classifyFailure } from "../integrations/email/classify-failure.js";
import type { EmailProvider } from "../integrations/email/provider.js";
import type { AiModelConfig } from "../integrations/ai/model-factory.js";
import type { SenderProfile } from "../modules/settings/settings.schema.js";
import { buildSenderVars } from "./sender-vars.js";
import { buildContactVars } from "./contact-vars.js";

// ---------------------------------------------------------------------------
// Dependency ports (injected — keeps the job unit-testable without a DB)
// ---------------------------------------------------------------------------

export interface ContactRow {
  id: number;
  companyName: string | null;
  location: string | null;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  website?: string | null;
  /** Extra spreadsheet columns ({{key}} → value). */
  customFields?: Record<string, unknown> | null;
  status: string;
  retryCount: number;
  lastContactedAt?: Date | null;
  sentAt?: Date | null;
}

export interface CampaignPort {
  getContact(id: number): Promise<ContactRow | null>;
  getSettings(): Promise<{
    mode: string;
    testEmail: string | null;
    language?: string;
    aiEnabled?: boolean;
    aiInstructions?: string | null;
    /** null = the user's default AI provider / that provider's saved model. */
    aiProvider?: string | null;
    aiModel?: string | null;
  } | null>;
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
  pickRandomActive(options?: { isFollowup?: boolean }): Promise<{ id: number; subject: string; body: string; documentId?: number | null } | undefined | null>;
}

export interface DocumentAttachment {
  filename: string;
  path: string;
}

export interface SettingsPort {
  /** Provider, key and model for the campaign's choice; null when no matching key is saved. */
  getAiConfig(choice: { provider: string | null; model: string | null }): Promise<AiModelConfig | null>;
  getSenderProfile(): Promise<SenderProfile>;
  buildSignature(profile: SenderProfile): string;
  /** The template's document as an attachment; null when it has none or it was deleted. */
  getDocumentAttachment(documentId?: number | null): Promise<DocumentAttachment | null>;
  /** Custom "My Profile" fields as template variables ({{key}} → value). */
  getProfileVars?(): Promise<Record<string, string>>;
}

export interface PersonalizeFn {
  (input: {
    template: { subject: string; body: string };
    vars: { company: string; location: string; candidate: { name: string; email?: string } };
    ai?: AiModelConfig;
    language?: string;
    instructions?: string;
  }): Promise<{ subject: string; body: string; aiUsed: boolean }>;
}

export interface LogInput {
  campaignId?: number | null;
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
  // let the AI personalize on top (with template fallback inside personalize()).
  const profile = await deps.settings.getSenderProfile();
  const signature = deps.settings.buildSignature(profile);

  // Custom profile fields go first so the built-in variables always win.
  const customVars = (await deps.settings.getProfileVars?.()) ?? {};
  const flatVars: Record<string, string> = {
    ...customVars,
    ...buildContactVars(contact),
    ...buildSenderVars(profile, signature),
  };
  const rendered = {
    subject: interpolate(template.subject, flatVars),
    body: interpolate(template.body, flatVars),
  };

  // AI enhancement is per campaign; with it off, or with no key saved for the chosen
  // provider, the rendered template is sent as written.
  const ai = settings?.aiEnabled === false
    ? null
    : await deps.settings.getAiConfig({ provider: settings?.aiProvider ?? null, model: settings?.aiModel ?? null });
  const personalized = await deps.personalize({
    template: rendered,
    vars: {
      company: contact.companyName ?? "",
      location: contact.location ?? "",
      candidate: { name: profile.name ?? "", email: profile.email },
    },
    ai: ai ?? undefined,
    language: settings?.language,
    instructions: settings?.aiInstructions ?? undefined,
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

  const attachment = await deps.settings.getDocumentAttachment(template.documentId);
  const attachments = attachment ? [attachment] : undefined;

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
