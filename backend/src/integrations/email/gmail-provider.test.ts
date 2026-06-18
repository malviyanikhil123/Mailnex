import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.mock is hoisted to the top of the file by Vitest, before any const/let
// declarations. We must NOT reference outer variables in the factory function.
// Instead we use vi.fn() directly inside the factory, then grab the mocks via
// the mocked module after import.
vi.mock("nodemailer", () => {
  const mockSendMail = vi.fn().mockResolvedValue({ messageId: "x" });
  const mockVerify = vi.fn().mockResolvedValue(true);
  const createTransport = vi.fn().mockReturnValue({
    sendMail: mockSendMail,
    verify: mockVerify,
  });
  return {
    default: { createTransport },
    createTransport,
  };
});

// Import AFTER vi.mock (Vitest handles ESM mock injection)
import nodemailer from "nodemailer";
import { GmailProvider } from "./gmail-provider.js";

describe("GmailProvider", () => {
  const creds = { user: "test@gmail.com", pass: "app-password" };

  // Helpers that resolve the mock functions from the mocked module
  function getCreateTransport() {
    return nodemailer.createTransport as ReturnType<typeof vi.fn>;
  }

  function getTransporter() {
    const ct = getCreateTransport();
    // Return the transporter that was returned by the most-recent createTransport call
    return ct.mock.results[ct.mock.results.length - 1]
      ?.value as { sendMail: ReturnType<typeof vi.fn>; verify: ReturnType<typeof vi.fn> };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    // Re-configure return values after clearAllMocks resets them
    const mockSendMail = vi.fn().mockResolvedValue({ messageId: "x" });
    const mockVerify = vi.fn().mockResolvedValue(true);
    getCreateTransport().mockReturnValue({ sendMail: mockSendMail, verify: mockVerify });
  });

  it("has name 'gmail'", () => {
    const provider = new GmailProvider(creds);
    expect(provider.name).toBe("gmail");
  });

  it("calls createTransport with pooled gmail config on construction", () => {
    new GmailProvider(creds);
    const ct = getCreateTransport();
    expect(ct).toHaveBeenCalledOnce();
    expect(ct).toHaveBeenCalledWith({
      service: "gmail",
      pool: true,
      maxConnections: 1,
      auth: { user: creds.user, pass: creds.pass },
    });
  });

  it("send() calls sendMail with from/to/subject/html/attachments", async () => {
    const provider = new GmailProvider(creds);
    const transporter = getTransporter();
    const msg = {
      to: "recipient@example.com",
      subject: "Hello",
      html: "<p>World</p>",
      attachments: [{ filename: "cv.pdf", path: "/tmp/cv.pdf" }],
    };

    const result = await provider.send(msg);

    expect(transporter.sendMail).toHaveBeenCalledOnce();
    const callArg = transporter.sendMail.mock.calls[0][0] as Record<string, unknown>;
    expect(callArg.from).toBe(creds.user);
    expect(callArg.to).toBe(msg.to);
    expect(callArg.subject).toBe(msg.subject);
    expect(callArg.html).toBe(msg.html);
    expect(callArg.attachments).toEqual(msg.attachments);
    expect(result).toEqual({ messageId: "x" });
  });

  it("send() works without attachments", async () => {
    const provider = new GmailProvider(creds);
    const transporter = getTransporter();
    const msg = {
      to: "recipient@example.com",
      subject: "No attachments",
      html: "<p>Plain</p>",
    };

    const result = await provider.send(msg);

    expect(transporter.sendMail).toHaveBeenCalledOnce();
    const callArg = transporter.sendMail.mock.calls[0][0] as Record<string, unknown>;
    expect(callArg.from).toBe(creds.user);
    expect(callArg.to).toBe(msg.to);
    expect(result).toEqual({ messageId: "x" });
  });

  it("verify() calls transporter.verify", async () => {
    const provider = new GmailProvider(creds);
    const transporter = getTransporter();
    await provider.verify();
    expect(transporter.verify).toHaveBeenCalledOnce();
  });

  it("send() returns the messageId from sendMail", async () => {
    const provider = new GmailProvider(creds);
    const transporter = getTransporter();
    transporter.sendMail.mockResolvedValueOnce({ messageId: "unique-msg-id-123" });

    const result = await provider.send({
      to: "a@b.com",
      subject: "s",
      html: "<p>h</p>",
    });
    expect(result.messageId).toBe("unique-msg-id-123");
  });
});
