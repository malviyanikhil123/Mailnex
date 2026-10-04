import { describe, it, expect } from "vitest";
import { matchRules, type RuleLike, type ClassifiableMessage } from "./rules-engine.js";

function rule(over: Partial<RuleLike> & { id: number; categoryId: number }): RuleLike {
  return {
    field: "SUBJECT",
    matchType: "CONTAINS",
    valueNormalized: "x",
    priority: 100,
    enabled: true,
    subStatus: null,
    ...over,
  };
}

function msg(over: Partial<ClassifiableMessage> = {}): ClassifiableMessage {
  return {
    fromAddress: "noreply@example.com",
    fromDomain: "example.com",
    subject: "Hello there",
    bodyText: "Some body text",
    ...over,
  };
}

describe("matchRules", () => {
  it("returns null when there are no rules", () => {
    expect(matchRules(msg(), [])).toBeNull();
  });

  it("returns null when nothing matches, so the caller can fall back to AI", () => {
    const rules = [rule({ id: 1, categoryId: 10, valueNormalized: "invoice" })];
    expect(matchRules(msg({ subject: "Hello there" }), rules)).toBeNull();
  });

  it("matches a simple CONTAINS on the subject", () => {
    const rules = [rule({ id: 1, categoryId: 10, valueNormalized: "hello" })];
    expect(matchRules(msg(), rules)).toEqual({ categoryId: 10, ruleId: 1, subStatus: null });
  });

  it("lower priority wins regardless of the order rows arrive in", () => {
    const rules = [
      rule({ id: 1, categoryId: 50, valueNormalized: "hello", priority: 50 }),
      rule({ id: 2, categoryId: 5, valueNormalized: "hello", priority: 5 }),
    ];
    expect(matchRules(msg(), rules)?.categoryId).toBe(5);
    // Same set, reversed — the engine sorts its own input, so the result must not change.
    expect(matchRules(msg(), [...rules].reverse())?.categoryId).toBe(5);
  });

  it("at equal priority a precise sender beats a loose body keyword", () => {
    const rules = [
      rule({ id: 1, categoryId: 99, field: "ANY_TEXT", valueNormalized: "body" }),
      rule({ id: 2, categoryId: 7, field: "FROM_ADDRESS", valueNormalized: "noreply@example.com", matchType: "EQUALS" }),
      rule({ id: 3, categoryId: 40, field: "BODY", valueNormalized: "body" }),
    ];
    expect(matchRules(msg(), rules)?.categoryId).toBe(7);
  });

  it("uses id as the final tiebreaker so the outcome is always deterministic", () => {
    const rules = [
      rule({ id: 9, categoryId: 90, valueNormalized: "hello" }),
      rule({ id: 4, categoryId: 40, valueNormalized: "hello" }),
    ];
    expect(matchRules(msg(), rules)?.ruleId).toBe(4);
  });

  it("skips disabled rules", () => {
    const rules = [
      rule({ id: 1, categoryId: 10, valueNormalized: "hello", enabled: false, priority: 1 }),
      rule({ id: 2, categoryId: 20, valueNormalized: "hello" }),
    ];
    expect(matchRules(msg(), rules)?.categoryId).toBe(20);
  });

  it("is case and accent insensitive on both sides", () => {
    const rules = [rule({ id: 1, categoryId: 10, valueNormalized: "resume" })];
    expect(matchRules(msg({ subject: "Your RESUME is ready" }), rules)).not.toBeNull();
    // NFKC folds the fullwidth form to ASCII.
    expect(matchRules(msg({ subject: "Ｒｅｓｕｍｅ attached" }), rules)).not.toBeNull();
  });

  it("collapses whitespace so a wrapped subject still matches", () => {
    const rules = [rule({ id: 1, categoryId: 10, valueNormalized: "payment due" })];
    expect(matchRules(msg({ subject: "Payment   \n  due soon" }), rules)).not.toBeNull();
  });

  it("FROM_DOMAIN EQUALS also matches a sending subdomain", () => {
    const rules = [
      rule({ id: 1, categoryId: 20, field: "FROM_DOMAIN", matchType: "EQUALS", valueNormalized: "chase.com" }),
    ];
    expect(matchRules(msg({ fromDomain: "chase.com" }), rules)?.categoryId).toBe(20);
    expect(matchRules(msg({ fromDomain: "email.chase.com" }), rules)?.categoryId).toBe(20);
    // Must not match a lookalike domain that merely ends with the same letters.
    expect(matchRules(msg({ fromDomain: "notchase.com" }), rules)).toBeNull();
  });

  it("EQUALS on a non-domain field stays exact", () => {
    const rules = [
      rule({ id: 1, categoryId: 20, field: "SUBJECT", matchType: "EQUALS", valueNormalized: "otp" }),
    ];
    expect(matchRules(msg({ subject: "OTP" }), rules)?.categoryId).toBe(20);
    expect(matchRules(msg({ subject: "Your OTP code" }), rules)).toBeNull();
  });

  it("supports STARTS_WITH and ENDS_WITH", () => {
    expect(
      matchRules(msg({ subject: "Invoice 1234" }), [
        rule({ id: 1, categoryId: 30, matchType: "STARTS_WITH", valueNormalized: "invoice" }),
      ])?.categoryId,
    ).toBe(30);
    expect(
      matchRules(msg({ subject: "Payment is due" }), [
        rule({ id: 1, categoryId: 30, matchType: "ENDS_WITH", valueNormalized: "due" }),
      ])?.categoryId,
    ).toBe(30);
  });

  it("ANY_TEXT searches subject, body and sender together", () => {
    const rules = [rule({ id: 1, categoryId: 10, field: "ANY_TEXT", valueNormalized: "noreply@example.com" })];
    expect(matchRules(msg({ subject: "nope", bodyText: "nope" }), rules)?.categoryId).toBe(10);
  });

  it("applies a valid regex", () => {
    const rules = [
      rule({ id: 1, categoryId: 5, matchType: "REGEX", valueNormalized: "\\b\\d{6}\\b" }),
    ];
    expect(matchRules(msg({ subject: "Your code is 482915" }), rules)?.categoryId).toBe(5);
  });

  it("skips an invalid regex instead of throwing", () => {
    const rules = [
      rule({ id: 1, categoryId: 5, matchType: "REGEX", valueNormalized: "([unclosed", priority: 1 }),
      rule({ id: 2, categoryId: 10, valueNormalized: "hello" }),
    ];
    expect(() => matchRules(msg(), rules)).not.toThrow();
    expect(matchRules(msg(), rules)?.categoryId).toBe(10);
  });

  it("ignores a rule with an empty value rather than matching everything", () => {
    const rules = [
      rule({ id: 1, categoryId: 5, valueNormalized: "", priority: 1 }),
      rule({ id: 2, categoryId: 10, valueNormalized: "hello" }),
    ];
    expect(matchRules(msg(), rules)?.categoryId).toBe(10);
  });

  it("propagates the matched rule's subStatus", () => {
    const rules = [
      rule({ id: 1, categoryId: 10, valueNormalized: "interview", subStatus: "INTERVIEW_INVITE" }),
    ];
    expect(matchRules(msg({ subject: "Interview invitation" }), rules)).toEqual({
      categoryId: 10,
      ruleId: 1,
      subStatus: "INTERVIEW_INVITE",
    });
  });

  it("does not match against an empty field", () => {
    const rules = [rule({ id: 1, categoryId: 10, field: "BODY", valueNormalized: "anything" })];
    expect(matchRules(msg({ bodyText: "" }), rules)).toBeNull();
  });
});
