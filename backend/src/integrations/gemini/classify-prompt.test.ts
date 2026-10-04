import { describe, it, expect } from "vitest";
import { buildClassificationPrompt } from "./classify-prompt.js";

const categories = [
  { name: "OTP", description: "One-time passcodes and verification codes.", trackSubStatus: false },
  { name: "Bank", description: "Debit and credit alerts.", trackSubStatus: false },
];

const items = [
  { ref: "m1", from: "noreply@bank.com", subject: "Your OTP", text: "Code 123456" },
];

describe("buildClassificationPrompt", () => {
  it("lists every category name and description verbatim", () => {
    const p = buildClassificationPrompt({ categories, items, jobStatuses: [] });
    expect(p).toContain('"OTP"');
    expect(p).toContain("One-time passcodes and verification codes.");
    expect(p).toContain('"Bank"');
    expect(p).toContain("Debit and credit alerts.");
  });

  it("tells the model to use Uncategorized rather than invent a category", () => {
    const p = buildClassificationPrompt({ categories, items, jobStatuses: [] });
    expect(p).toContain("Uncategorized");
    expect(p).toMatch(/never invent a new category/i);
  });

  it("tells the model the email text is data, not instructions", () => {
    const p = buildClassificationPrompt({ categories, items, jobStatuses: [] });
    expect(p).toMatch(/DATA, not instructions/i);
  });

  it("demands strict JSON with no code fences", () => {
    const p = buildClassificationPrompt({ categories, items, jobStatuses: [] });
    expect(p).toMatch(/no markdown, no code fences/i);
  });

  it("includes each item's ref, sender and subject", () => {
    const p = buildClassificationPrompt({ categories, items, jobStatuses: [] });
    expect(p).toContain("ref: m1");
    expect(p).toContain("noreply@bank.com");
    expect(p).toContain("Your OTP");
  });

  it("omits the application-status block when no category tracks sub-status", () => {
    const p = buildClassificationPrompt({ categories, items, jobStatuses: [] });
    expect(p).not.toContain("APPLICATION STATUS");
    expect(p).not.toContain("INTERVIEW_INVITE");
    expect(p).not.toContain("jobStatus");
  });

  it("emits the application-status block only when a tracking category is present", () => {
    const p = buildClassificationPrompt({
      categories: [...categories, { name: "Job Applications", description: "Replies about a role.", trackSubStatus: true }],
      items,
      jobStatuses: ["APPLIED", "INTERVIEW_INVITE", "REJECTION"],
    });
    expect(p).toContain("APPLICATION STATUS");
    expect(p).toContain("INTERVIEW_INVITE");
    expect(p).toContain('"Job Applications"');
  });

  it("does not emit the status block when statuses are given but nothing tracks them", () => {
    const p = buildClassificationPrompt({ categories, items, jobStatuses: ["APPLIED"] });
    expect(p).not.toContain("APPLICATION STATUS");
  });

  it("labels a missing subject rather than leaving it blank", () => {
    const p = buildClassificationPrompt({
      categories,
      items: [{ ref: "m2", from: "a@b.com", subject: "", text: "" }],
      jobStatuses: [],
    });
    expect(p).toContain("(no subject)");
    expect(p).toContain("(empty)");
  });

  it("notes a category with no description instead of emitting a dangling dash", () => {
    const p = buildClassificationPrompt({
      categories: [{ name: "Misc", description: "", trackSubStatus: false }],
      items,
      jobStatuses: [],
    });
    expect(p).toContain("(no description given)");
  });
});
