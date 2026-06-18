import { describe, it, expect, vi } from "vitest";

// Mock nodemailer so GmailProvider construction doesn't fail
vi.mock("nodemailer", () => ({
  default: {
    createTransport: vi.fn().mockReturnValue({
      sendMail: vi.fn(),
      verify: vi.fn(),
    }),
  },
  createTransport: vi.fn().mockReturnValue({
    sendMail: vi.fn(),
    verify: vi.fn(),
  }),
}));

import { getEmailProvider } from "./factory.js";

describe("getEmailProvider", () => {
  it("returns a provider with name 'gmail' for provider='gmail'", () => {
    const provider = getEmailProvider({
      provider: "gmail",
      gmail: { user: "test@gmail.com", pass: "secret" },
    });
    expect(provider.name).toBe("gmail");
  });

  it("returned gmail provider has send and verify methods", () => {
    const provider = getEmailProvider({
      provider: "gmail",
      gmail: { user: "test@gmail.com", pass: "secret" },
    });
    expect(typeof provider.send).toBe("function");
    expect(typeof provider.verify).toBe("function");
  });

  it("throws for unknown provider 'outlook'", () => {
    expect(() =>
      getEmailProvider({ provider: "outlook" })
    ).toThrow("Unsupported email provider: outlook");
  });

  it("throws for unknown provider 'sendgrid'", () => {
    expect(() =>
      getEmailProvider({ provider: "sendgrid" })
    ).toThrow("Unsupported email provider: sendgrid");
  });

  it("throws for unknown provider 'ses'", () => {
    expect(() =>
      getEmailProvider({ provider: "ses" })
    ).toThrow("Unsupported email provider: ses");
  });

  it("throws for completely unknown provider name", () => {
    expect(() =>
      getEmailProvider({ provider: "unknown-future-provider" })
    ).toThrow("Unsupported email provider: unknown-future-provider");
  });
});
