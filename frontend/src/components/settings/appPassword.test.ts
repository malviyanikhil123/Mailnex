import { describe, it, expect } from "vitest";
import { APP_PASSWORD_ERROR, appPasswordError, emailAddressError, normalizeAppPassword } from "./appPassword";

describe("app password helpers", () => {
  it("accepts Google's spaced or dashed 16-letter code", () => {
    expect(normalizeAppPassword("abcd efgh ijkl mnop")).toBe("abcdefghijklmnop");
    expect(normalizeAppPassword("ABCD-EFGH-IJKL-MNOP")).toBe("abcdefghijklmnop");
    expect(appPasswordError(" abcd efgh ijkl mnop ")).toBeNull();
  });

  it("rejects anything else with the friendly message", () => {
    expect(appPasswordError("")).toBe(APP_PASSWORD_ERROR);
    expect(appPasswordError("abcd efgh ijkl mno")).toBe(APP_PASSWORD_ERROR);
    expect(appPasswordError("abcd efgh ijkl mn0p")).toBe(APP_PASSWORD_ERROR);
    expect(appPasswordError("my gmail login password")).toBe(APP_PASSWORD_ERROR);
  });

  it("allows any email domain but requires a real address", () => {
    expect(emailAddressError("me@gmail.com")).toBeNull();
    expect(emailAddressError(" me@acme.io ")).toBeNull();
    expect(emailAddressError("me@")).toBe("Enter a valid email address");
    expect(emailAddressError("me")).toBe("Enter a valid email address");
  });
});
