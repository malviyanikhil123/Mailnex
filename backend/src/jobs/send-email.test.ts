import { describe, it, expect, vi, beforeEach } from "vitest";
import { sendEmailJob, type SendEmailDeps, type LogInput } from "./send-email.js";
import type { AiModelConfig } from "../integrations/ai/model-factory.js";

const NOW = new Date(2026, 5, 18, 10, 0, 0, 0);
const HOUR = 3_600_000;

function makeDeps(overrides?: {
  mode?: string;
  testEmail?: string | null;
  retryCount?: number;
  sendImpl?: () => Promise<{ messageId: string }>;
  template?: { id: number; subject: string; body: string; documentId?: number | null } | null;
  /** What the settings port resolves for the campaign's provider choice. */
  aiConfig?: AiModelConfig | null;
  aiEnabled?: boolean;
  aiProvider?: string | null;
  aiModel?: string | null;
  language?: string;
  aiInstructions?: string | null;
  profileVars?: Record<string, string>;
}): { deps: SendEmailDeps; logs: LogInput[]; send: ReturnType<typeof vi.fn>; campaign: any } {
  const logs: LogInput[] = [];
  const send = vi.fn(overrides?.sendImpl ?? (async () => ({ messageId: "mid-1" })));

  const campaign = {
    getContact: vi.fn(async () => ({
      id: 1,
      companyName: "Acme",
      location: "Berlin",
      email: "hr@acme.com",
      status: "PENDING",
      retryCount: overrides?.retryCount ?? 0,
    })),
    getSettings: vi.fn(async () => ({
      mode: overrides?.mode ?? "LIVE",
      testEmail: overrides?.testEmail ?? null,
      language: overrides?.language,
      aiEnabled: overrides?.aiEnabled,
      aiInstructions: overrides?.aiInstructions,
      aiProvider: overrides?.aiProvider,
      aiModel: overrides?.aiModel,
    })),
    setState: vi.fn(async () => ({})),
    markContactProcessing: vi.fn(async () => {}),
    markContactSent: vi.fn(async () => {}),
    markContactBounced: vi.fn(async () => {}),
    markContactFailed: vi.fn(async () => {}),
    scheduleRetry: vi.fn(async () => {}),
    resetContactPending: vi.fn(async () => {}),
    incQuota: vi.fn(async () => 1),
  };

  const deps: SendEmailDeps = {
    campaign,
    templates: {
      pickRandomActive: vi.fn(async () =>
        overrides?.template === undefined
          ? { id: 7, subject: "Hi {{company}}", body: "Dear {{company}} in {{location}}.\n{{signature}}", documentId: 3 }
          : overrides.template,
      ),
    },
    settings: {
      getAiConfig: vi.fn(async () => overrides?.aiConfig ?? null),
      getSenderProfile: vi.fn(async () => ({ name: "Nikhil", email: "n@x.dev" })),
      buildSignature: vi.fn(() => "Regards,\nNikhil"),
      getDocumentAttachment: vi.fn(async (documentId?: number | null) =>
        documentId === 3 ? { filename: "Price list.pdf", path: "/uploads/documents/abc.pdf" } : null,
      ),
      getProfileVars: vi.fn(async () => overrides?.profileVars ?? {}),
    },
    personalize: vi.fn(async (input) => ({
      subject: input.template.subject,
      body: input.template.body,
      aiUsed: false,
    })),
    getProvider: vi.fn(async () => ({ name: "gmail", verify: vi.fn(), send })),
    logs: { create: vi.fn(async (l: LogInput) => { logs.push(l); }) },
    now: () => NOW,
  };

  return { deps, logs, send, campaign };
}

describe("sendEmailJob", () => {
  beforeEach(() => vi.clearAllMocks());

  it("DRAFT mode: generates + logs GENERATED, does NOT send, leaves contact PENDING", async () => {
    const { deps, logs, send, campaign } = makeDeps({ mode: "DRAFT" });
    const res = await sendEmailJob(1, deps);
    expect(res.outcome).toBe("draft");
    expect(send).not.toHaveBeenCalled();
    expect(logs[0].status).toBe("GENERATED");
    expect(campaign.resetContactPending).toHaveBeenCalledWith(1);
    expect(campaign.markContactSent).not.toHaveBeenCalled();
  });

  it("TEST mode: sends to the configured testEmail, not the contact", async () => {
    const { deps, send } = makeDeps({ mode: "TEST", testEmail: "test@me.dev" });
    const res = await sendEmailJob(1, deps);
    expect(res.outcome).toBe("sent");
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].to).toBe("test@me.dev");
  });

  it("TEST mode without testEmail: skips and logs SKIPPED, never marks processing-as-sent", async () => {
    const { deps, logs, send } = makeDeps({ mode: "TEST", testEmail: null });
    const res = await sendEmailJob(1, deps);
    expect(res.outcome).toBe("skipped");
    expect(send).not.toHaveBeenCalled();
    expect(logs[0].status).toBe("SKIPPED");
  });

  it("LIVE success: sends to contact email, logs SENT, marks SENT, increments quota", async () => {
    const { deps, send, campaign, logs } = makeDeps({ mode: "LIVE" });
    const res = await sendEmailJob(1, deps);
    expect(res.outcome).toBe("sent");
    expect(send.mock.calls[0][0].to).toBe("hr@acme.com");
    expect(send.mock.calls[0][0].attachments).toEqual([
      { filename: "Price list.pdf", path: "/uploads/documents/abc.pdf" },
    ]);
    expect(deps.settings.getDocumentAttachment).toHaveBeenCalledWith(3);
    expect(logs[0].status).toBe("SENT");
    expect(campaign.markContactSent).toHaveBeenCalledWith(1, NOW);
    expect(campaign.incQuota).toHaveBeenCalledWith(NOW);
  });

  it("template without a document: sends with no attachments", async () => {
    const { deps, send } = makeDeps({ template: { id: 8, subject: "Hi", body: "Hello", documentId: null } });
    const res = await sendEmailJob(1, deps);
    expect(res.outcome).toBe("sent");
    expect(send.mock.calls[0][0].attachments).toBeUndefined();
  });

  it("template whose document was deleted: still sends, just without the attachment", async () => {
    const { deps, send, logs } = makeDeps({ template: { id: 9, subject: "Hi", body: "Hello", documentId: 42 } });
    const res = await sendEmailJob(1, deps);
    expect(res.outcome).toBe("sent");
    expect(deps.settings.getDocumentAttachment).toHaveBeenCalledWith(42);
    expect(send.mock.calls[0][0].attachments).toBeUndefined();
    expect(logs[0].status).toBe("SENT");
  });

  it("DRAFT mode never looks up the attachment", async () => {
    const { deps } = makeDeps({ mode: "DRAFT" });
    await sendEmailJob(1, deps);
    expect(deps.settings.getDocumentAttachment).not.toHaveBeenCalled();
  });

  it("Quota error → pauses campaign, leaves contact PENDING (not failed/bounced)", async () => {
    const { deps, campaign, logs } = makeDeps({
      mode: "LIVE",
      sendImpl: async () => { throw { message: "Daily user sending limit exceeded", responseCode: 550 }; },
    });
    const res = await sendEmailJob(1, deps);
    expect(res.outcome).toBe("paused");
    expect(campaign.setState).toHaveBeenCalledWith("PAUSED");
    expect(campaign.resetContactPending).toHaveBeenCalledWith(1);
    expect(campaign.markContactFailed).not.toHaveBeenCalled();
    expect(campaign.markContactBounced).not.toHaveBeenCalled();
    expect(logs[0].status).toBe("SKIPPED");
  });

  it("Permanent failure → BOUNCED, never retried", async () => {
    const { deps, campaign, logs } = makeDeps({
      mode: "LIVE",
      sendImpl: async () => { throw { responseCode: 550, message: "No such user here" }; },
    });
    const res = await sendEmailJob(1, deps);
    expect(res.outcome).toBe("bounced");
    expect(campaign.markContactBounced).toHaveBeenCalledWith(1);
    expect(campaign.scheduleRetry).not.toHaveBeenCalled();
    expect(logs[0].status).toBe("BOUNCED");
    expect(logs[0].failureType).toBe("PERMANENT");
  });

  it("Temporary failure (1st) → schedules retry at +1h, status PENDING via scheduleRetry", async () => {
    const { deps, campaign, logs } = makeDeps({
      mode: "LIVE",
      retryCount: 0,
      sendImpl: async () => { throw { code: "ETIMEDOUT", message: "connection timeout" }; },
    });
    const res = await sendEmailJob(1, deps);
    expect(res.outcome).toBe("retry");
    expect(campaign.scheduleRetry).toHaveBeenCalledTimes(1);
    const [id, retryCount, nextRetryAt] = campaign.scheduleRetry.mock.calls[0];
    expect(id).toBe(1);
    expect(retryCount).toBe(1);
    expect((nextRetryAt as Date).getTime()).toBe(NOW.getTime() + 1 * HOUR);
    expect(logs[0].status).toBe("RETRY_SCHEDULED");
  });

  it("Temporary failure (2nd) → retry at +6h", async () => {
    const { deps, campaign } = makeDeps({
      mode: "LIVE",
      retryCount: 1,
      sendImpl: async () => { throw { code: "ECONNRESET" }; },
    });
    await sendEmailJob(1, deps);
    const [, retryCount, nextRetryAt] = campaign.scheduleRetry.mock.calls[0];
    expect(retryCount).toBe(2);
    expect((nextRetryAt as Date).getTime()).toBe(NOW.getTime() + 6 * HOUR);
  });

  it("Temporary failure exceeding MAX_RETRIES (4th) → FAILED", async () => {
    const { deps, campaign, logs } = makeDeps({
      mode: "LIVE",
      retryCount: 3,
      sendImpl: async () => { throw { code: "ETIMEDOUT" }; },
    });
    const res = await sendEmailJob(1, deps);
    expect(res.outcome).toBe("failed");
    expect(campaign.markContactFailed).toHaveBeenCalledWith(1);
    expect(campaign.scheduleRetry).not.toHaveBeenCalled();
    expect(logs[0].status).toBe("FAILED");
  });

  it("No active template → SKIPPED and contact reset to PENDING", async () => {
    const { deps, send, campaign, logs } = makeDeps({ mode: "LIVE", template: null });
    const res = await sendEmailJob(1, deps);
    expect(res.outcome).toBe("skipped");
    expect(send).not.toHaveBeenCalled();
    expect(logs[0].status).toBe("SKIPPED");
    expect(campaign.resetContactPending).toHaveBeenCalledWith(1);
  });

  it("interpolates company/location/signature into the rendered template", async () => {
    const { deps, send } = makeDeps({ mode: "LIVE" });
    await sendEmailJob(1, deps);
    const sent = send.mock.calls[0][0];
    expect(sent.subject).toContain("Acme");
    expect(sent.html).toContain("Berlin");
    expect(sent.html).toContain("Regards,");
    expect(sent.html).not.toContain("{{");
  });

  it("interpolates the {{my_*}} sender variables from My Profile", async () => {
    const { deps, send } = makeDeps({
      template: {
        id: 98,
        subject: "{{my_company}} x {{company}}",
        body: "I'm {{my_name}} ({{my_email}}, {{my_phone}}).\n{{my_website}} | {{my_linkedin}}\n{{signature}}",
      },
    });
    deps.settings.getSenderProfile = vi.fn(async () => ({
      name: "Priya Shah",
      company: "Northwind",
      email: "priya@northwind.com",
      phone: "+1 555 0100",
      website: "https://northwind.com",
      linkedin: "https://linkedin.com/in/priya",
    }));

    await sendEmailJob(1, deps);
    const sent = send.mock.calls[0][0];
    expect(sent.subject).toBe("Northwind x Acme");
    for (const value of ["Priya Shah", "priya@northwind.com", "+1 555 0100", "https://northwind.com", "https://linkedin.com/in/priya"]) {
      expect(sent.html).toContain(value);
    }
    expect(sent.html).not.toContain("{{");
  });

  it("interpolates LinkedIn, GitHub, Portfolio, phone, and email variables", async () => {
    const { deps, send } = makeDeps({
      mode: "LIVE",
      template: {
        id: 99,
        subject: "Application for {{role}} at {{company}} — {{candidateName}}",
        body: "Hi {{company}} team,\n" +
              "You can find my work here:\n" +
              "LinkedIn: {{LinkedIn}}\n" +
              "GitHub: {{GitHub}}\n" +
              "Portfolio: {{Portfolio}}\n\n" +
              "Best regards,\n" +
              "{{candidateName}}\n" +
              "{{phone}}\n" +
              "{{email}}",
      },
    });

    deps.settings.getSenderProfile = vi.fn(async () => ({
      name: "Alex Morgan",
      email: "alex@example.com",
      phone: "+91 9876543210",
      role: "Backend Engineer",
      experience: "5+ years",
      skills: ["Node.js", "TypeScript"],
      linkedin: "https://linkedin.com/in/alexmorgan",
      github: "https://github.com/alexmorgan",
      portfolio: "https://alexmorgan.dev",
    }));

    await sendEmailJob(1, deps);
    const sent = send.mock.calls[0][0];
    expect(sent.subject).toBe("Application for Backend Engineer at Acme — Alex Morgan");
    expect(sent.html).toContain("https://linkedin.com/in/alexmorgan");
    expect(sent.html).toContain("https://github.com/alexmorgan");
    expect(sent.html).toContain("https://alexmorgan.dev");
    expect(sent.html).toContain("+91 9876543210");
    expect(sent.html).toContain("alex@example.com");
    expect(sent.html).not.toContain("{{");
  });

  it("passes the campaign language and AI instructions to personalization", async () => {
    const ai: AiModelConfig = { provider: "google", apiKey: "key", model: "gemini-3.5-flash-lite" };
    const { deps } = makeDeps({ aiConfig: ai, language: "Hindi", aiInstructions: "Mention the offer" });
    await sendEmailJob(1, deps);
    expect(deps.personalize).toHaveBeenCalledWith(
      expect.objectContaining({ ai, language: "Hindi", instructions: "Mention the offer" }),
    );
  });

  it("resolves the campaign's own provider and model, null meaning the user's default", async () => {
    const ai: AiModelConfig = { provider: "anthropic", apiKey: "key", model: "claude-sonnet-5-5" };
    const { deps } = makeDeps({ aiConfig: ai, aiProvider: "anthropic", aiModel: "claude-sonnet-5-5" });
    await sendEmailJob(1, deps);
    expect(deps.settings.getAiConfig).toHaveBeenCalledWith({ provider: "anthropic", model: "claude-sonnet-5-5" });
    expect(deps.personalize).toHaveBeenCalledWith(expect.objectContaining({ ai }));

    const plain = makeDeps({ aiConfig: ai });
    await sendEmailJob(1, plain.deps);
    expect(plain.deps.settings.getAiConfig).toHaveBeenCalledWith({ provider: null, model: null });
  });

  it("with AI on but no key saved, sends the rendered template without AI", async () => {
    const { deps, send } = makeDeps({ aiConfig: null });
    await sendEmailJob(1, deps);
    expect(deps.personalize).toHaveBeenCalledWith(expect.objectContaining({ ai: undefined }));
    expect(send.mock.calls[0][0].subject).toBe("Hi Acme");
  });

  it("with AI enhancement off, never resolves an AI key for personalization", async () => {
    const ai: AiModelConfig = { provider: "openai", apiKey: "key", model: "gpt-5.4-mini" };
    const { deps } = makeDeps({ aiConfig: ai, aiEnabled: false });
    await sendEmailJob(1, deps);
    expect(deps.settings.getAiConfig).not.toHaveBeenCalled();
    expect(deps.personalize).toHaveBeenCalledWith(expect.objectContaining({ ai: undefined }));
  });

  it("fills custom profile fields into the template but never lets them shadow built-ins", async () => {
    const { deps, send } = makeDeps({
      template: { id: 7, subject: "{{offer}} for {{company}}", body: "Hi" },
      profileVars: { offer: "20% off", company: "WRONG" },
    });
    await sendEmailJob(1, deps);
    expect(send.mock.calls[0][0].subject).toBe("20% off for Acme");
  });
});
