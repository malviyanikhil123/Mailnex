import { describe, it, expect } from "vitest";
import { isValidEmail } from "./email-validator.js";

describe("isValidEmail", () => {
  it("accepts valid email", () => {
    expect(isValidEmail("a@b.com")).toBe(true);
    expect(isValidEmail("  hello@world.org  ")).toBe(true); // trims whitespace
    expect(isValidEmail("user+tag@example.co.uk")).toBe(true);
  });
  it("rejects invalid email", () => {
    expect(isValidEmail("nope")).toBe(false);
    expect(isValidEmail("@b.com")).toBe(false);
    expect(isValidEmail("a@")).toBe(false);
    expect(isValidEmail("")).toBe(false);
    expect(isValidEmail("a b@c.com")).toBe(false);
  });
});
