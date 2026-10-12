import { describe, it, expect } from "vitest";
import { APP_PASSWORD_MESSAGE, appPasswordSchema, normalizeAppPassword } from "./app-password.js";

describe("normalizeAppPassword", () => {
  it("accepts Google's spaced format and returns the bare letters", () => {
    expect(normalizeAppPassword("abcd efgh ijkl mnop")).toBe("abcdefghijklmnop");
  });

  it("accepts dashes, extra or non-breaking spaces and upper case", () => {
    expect(normalizeAppPassword(" ABCD-efgh  ijkl MNOP ")).toBe("abcdefghijklmnop");
    expect(normalizeAppPassword("abcdefghijklmnop")).toBe("abcdefghijklmnop");
  });

  it("rejects anything that is not exactly 16 letters", () => {
    expect(normalizeAppPassword("")).toBeNull();
    expect(normalizeAppPassword("abcd efgh ijkl mno")).toBeNull(); // 15
    expect(normalizeAppPassword("abcd efgh ijkl mnopq")).toBeNull(); // 17
    expect(normalizeAppPassword("abcd efgh ijkl mn0p")).toBeNull(); // digit
    expect(normalizeAppPassword("abcd efgh ijkl mnöp")).toBeNull(); // non-ASCII letter
    expect(normalizeAppPassword("my-regular-gmail-password")).toBeNull();
  });
});

describe("appPasswordSchema", () => {
  it("transforms valid input to the normalized form", () => {
    expect(appPasswordSchema.parse("Abcd Efgh Ijkl Mnop")).toBe("abcdefghijklmnop");
  });

  it("fails with the friendly message", () => {
    const result = appPasswordSchema.safeParse("hunter2");
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe(APP_PASSWORD_MESSAGE);
  });
});
