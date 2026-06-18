import { describe, it, expect, vi, beforeEach } from "vitest";
import { sendEmailJob, type SendEmailDeps, type LogInput } from "./send-email.js";

const NOW = new Date(2026, 5, 18, 10, 0, 0, 0);
const HOUR = 3_600_000;

function makeDeps(overrides?: {
  mode?: string;
  testEmail?: string | null;
  retryCount?: number;
  sendImpl?: () => Promise<{ messageId: string }>;
  template?: { id: number; subject: string; body: string } | null;
  geminiKey?: string;
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
          ? { id: 7, subject: "Hi {{company}}", body: "Dear {{company}} in {{location}}.\n{{signature}}" }
          : overrides.template,
      ),
    },
    settings: {
      getGeminiKey: vi.fn(async () => overrides?.geminiKey ?? ""),
      getCandidateProfile: vi.fn(async () => ({ name: "Nikhil", email: "n@x.dev" })),
      buildSignature: vi.fn(() => "Regards,\nNikhil"),
      getResumePath: vi.fn(async () => "/uploads/resume.pdf"),
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
      { filename: "resume.pdf", path: "/uploads/resume.pdf" },
    ]);
    expect(logs[0].status).toBe("SENT");
    expect(campaign.markContactSent).toHaveBeenCalledWith(1, NOW);
    expect(campaign.incQuota).toHaveBeenCalledWith(NOW);
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
});
