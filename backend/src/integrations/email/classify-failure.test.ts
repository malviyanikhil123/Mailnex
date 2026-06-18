import { describe, it, expect } from "vitest";
import { classifyFailure } from "./classify-failure.js";

describe("classifyFailure", () => {
  // --- PERMANENT cases ---

  it("classifies responseCode 550 with 'No such user' as PERMANENT", () => {
    const err = { responseCode: 550, message: "No such user here" };
    const result = classifyFailure(err);
    expect(result.type).toBe("PERMANENT");
    expect(result.isQuota).toBe(false);
    expect(result.code).toBe("550");
    expect(result.message).toBe("No such user here");
  });

  it("classifies responseCode 550 (generic 5xx) as PERMANENT", () => {
    const result = classifyFailure({ responseCode: 550 });
    expect(result.type).toBe("PERMANENT");
    expect(result.isQuota).toBe(false);
  });

  it("classifies responseCode 551 (5xx invalid recipient) as PERMANENT", () => {
    const result = classifyFailure({ responseCode: 551, message: "User not local" });
    expect(result.type).toBe("PERMANENT");
    expect(result.isQuota).toBe(false);
  });

  it("classifies message 'mailbox unavailable' as PERMANENT", () => {
    const result = classifyFailure({ message: "Mailbox unavailable" });
    expect(result.type).toBe("PERMANENT");
    expect(result.isQuota).toBe(false);
  });

  it("classifies message 'address rejected' as PERMANENT", () => {
    const result = classifyFailure({ message: "Address rejected by server" });
    expect(result.type).toBe("PERMANENT");
    expect(result.isQuota).toBe(false);
  });

  it("classifies message 'domain not found' as PERMANENT", () => {
    const result = classifyFailure({ message: "Domain not found" });
    expect(result.type).toBe("PERMANENT");
    expect(result.isQuota).toBe(false);
  });

  it("classifies message 'user unknown' as PERMANENT", () => {
    const result = classifyFailure({ message: "User unknown in virtual mailbox table" });
    expect(result.type).toBe("PERMANENT");
    expect(result.isQuota).toBe(false);
  });

  // --- TEMPORARY cases ---

  it("classifies responseCode 421 as TEMPORARY", () => {
    const result = classifyFailure({ responseCode: 421 });
    expect(result.type).toBe("TEMPORARY");
    expect(result.isQuota).toBe(false);
    expect(result.code).toBe("421");
  });

  it("classifies responseCode 4xx (generic) as TEMPORARY", () => {
    const result = classifyFailure({ responseCode: 452, message: "Insufficient storage" });
    expect(result.type).toBe("TEMPORARY");
    expect(result.isQuota).toBe(false);
  });

  it("classifies ECONNRESET code as TEMPORARY", () => {
    const result = classifyFailure({ code: "ECONNRESET" });
    expect(result.type).toBe("TEMPORARY");
    expect(result.isQuota).toBe(false);
    expect(result.code).toBe("ECONNRESET");
  });

  it("classifies ETIMEDOUT code as TEMPORARY", () => {
    const result = classifyFailure({ code: "ETIMEDOUT" });
    expect(result.type).toBe("TEMPORARY");
    expect(result.isQuota).toBe(false);
    expect(result.code).toBe("ETIMEDOUT");
  });

  it("classifies ESOCKET code as TEMPORARY", () => {
    const result = classifyFailure({ code: "ESOCKET" });
    expect(result.type).toBe("TEMPORARY");
    expect(result.isQuota).toBe(false);
  });

  it("classifies message containing 'timeout' as TEMPORARY", () => {
    const result = classifyFailure({ message: "Connection timeout exceeded" });
    expect(result.type).toBe("TEMPORARY");
    expect(result.isQuota).toBe(false);
  });

  it("classifies message containing 'temporarily' as TEMPORARY", () => {
    const result = classifyFailure({ message: "Service temporarily unavailable" });
    expect(result.type).toBe("TEMPORARY");
    expect(result.isQuota).toBe(false);
  });

  // --- Quota cases (TEMPORARY + isQuota:true) ---

  it("classifies 'Daily user sending limit exceeded' as TEMPORARY + isQuota", () => {
    const result = classifyFailure({ message: "Daily user sending limit exceeded" });
    expect(result.type).toBe("TEMPORARY");
    expect(result.isQuota).toBe(true);
  });

  it("classifies message containing 'quota' as TEMPORARY + isQuota", () => {
    const result = classifyFailure({ message: "Quota exceeded for user" });
    expect(result.type).toBe("TEMPORARY");
    expect(result.isQuota).toBe(true);
  });

  it("classifies '550 5.4.5' style message as TEMPORARY + isQuota", () => {
    const result = classifyFailure({ responseCode: 550, message: "550 5.4.5 Daily sending quota exceeded" });
    expect(result.type).toBe("TEMPORARY");
    expect(result.isQuota).toBe(true);
  });

  // --- Default fallback ---

  it("defaults unknown error object to TEMPORARY", () => {
    const result = classifyFailure({ message: "Something weird happened" });
    expect(result.type).toBe("TEMPORARY");
    expect(result.isQuota).toBe(false);
  });

  it("defaults plain Error object to TEMPORARY", () => {
    const result = classifyFailure(new Error("Unexpected failure"));
    expect(result.type).toBe("TEMPORARY");
    expect(result.isQuota).toBe(false);
    expect(result.message).toBe("Unexpected failure");
  });

  // --- Robustness to weird inputs ---

  it("handles null input gracefully", () => {
    const result = classifyFailure(null);
    expect(result.type).toBe("TEMPORARY");
    expect(result.isQuota).toBe(false);
    expect(result.code).toBe("UNKNOWN");
    expect(result.message).toBe("Unknown error");
  });

  it("handles undefined input gracefully", () => {
    const result = classifyFailure(undefined);
    expect(result.type).toBe("TEMPORARY");
    expect(result.isQuota).toBe(false);
    expect(result.code).toBe("UNKNOWN");
  });

  it("handles string input gracefully", () => {
    const result = classifyFailure("some string error");
    expect(result.type).toBe("TEMPORARY");
    expect(result.isQuota).toBe(false);
  });

  it("handles number input gracefully", () => {
    const result = classifyFailure(42);
    expect(result.type).toBe("TEMPORARY");
    expect(result.isQuota).toBe(false);
  });
});
