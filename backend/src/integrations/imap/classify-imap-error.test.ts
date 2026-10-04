import { describe, it, expect } from "vitest";
import { classifyImapError } from "./classify-imap-error.js";

describe("classifyImapError", () => {
  it("flags a missing app password as NOT_CONFIGURED and not retryable", () => {
    const r = classifyImapError(Object.assign(new Error("NOT_CONFIGURED"), { imapCode: "NOT_CONFIGURED" }));
    expect(r.code).toBe("NOT_CONFIGURED");
    expect(r.retryable).toBe(false);
    expect(r.message).toMatch(/Settings/i);
  });

  it("maps a rejected app password to AUTH_FAILED", () => {
    const r = classifyImapError({ message: "Invalid credentials (Failure)", responseText: "AUTHENTICATIONFAILED" });
    expect(r.code).toBe("AUTH_FAILED");
  });

  it("never retries AUTH_FAILED — repeated attempts can lock the Gmail account", () => {
    expect(classifyImapError({ message: "Invalid credentials" }).retryable).toBe(false);
    expect(classifyImapError({ message: "Username and password not accepted" }).retryable).toBe(false);
    expect(classifyImapError({ message: "Application-specific password required" }).retryable).toBe(false);
  });

  it("detects disabled IMAP from Gmail's [ALERT] string and does not retry it", () => {
    const r = classifyImapError({ message: "[ALERT] IMAP access is disabled for your domain." });
    expect(r.code).toBe("IMAP_DISABLED");
    expect(r.retryable).toBe(false);
  });

  it("prefers IMAP_DISABLED over AUTH_FAILED when the alert mentions both", () => {
    const r = classifyImapError({
      message: "[ALERT] Please log in via your web browser: IMAP access is disabled. Invalid credentials",
    });
    expect(r.code).toBe("IMAP_DISABLED");
  });

  it("classifies transient socket errors as NETWORK and retryable", () => {
    for (const code of ["ECONNRESET", "ETIMEDOUT", "ENOTFOUND", "EPIPE", "ECONNREFUSED"]) {
      const r = classifyImapError({ code, message: "socket hang up" });
      expect(r.code).toBe("NETWORK");
      expect(r.retryable).toBe(true);
    }
  });

  it("classifies a timeout message as NETWORK even without a code", () => {
    expect(classifyImapError({ message: "Command timed out" }).code).toBe("NETWORK");
  });

  it("classifies a vanished mailbox or UIDVALIDITY drift as MAILBOX_GONE and retryable", () => {
    expect(classifyImapError({ message: "NONEXISTENT Unknown Mailbox" }).code).toBe("MAILBOX_GONE");
    expect(classifyImapError({ message: "UIDVALIDITY changed" }).retryable).toBe(true);
  });

  it("falls back to UNKNOWN and stays retryable", () => {
    const r = classifyImapError({ message: "Something odd happened" });
    expect(r.code).toBe("UNKNOWN");
    expect(r.retryable).toBe(true);
  });

  it("handles a bare string, null and undefined without throwing", () => {
    expect(classifyImapError("Invalid credentials").code).toBe("AUTH_FAILED");
    expect(classifyImapError(null).code).toBe("UNKNOWN");
    expect(classifyImapError(undefined).code).toBe("UNKNOWN");
    expect(classifyImapError(42).message).toBe("Unknown IMAP error");
  });
});
