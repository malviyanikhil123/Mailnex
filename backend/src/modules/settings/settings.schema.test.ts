import { describe, it, expect } from "vitest";
import { APP_PASSWORD_MESSAGE } from "../../utils/app-password.js";
import { updateGmailSchema } from "./settings.schema.js";

describe("updateGmailSchema", () => {
  it("normalizes the address and the spaced app password", () => {
    expect(updateGmailSchema.parse({ email: " Me@Gmail.com", appPassword: "abcd efgh ijkl mnop" })).toEqual({
      email: "me@gmail.com",
      appPassword: "abcdefghijklmnop",
    });
  });

  it("accepts googlemail.com and Workspace domains", () => {
    expect(updateGmailSchema.safeParse({ email: "me@googlemail.com", appPassword: "abcdefghijklmnop" }).success).toBe(true);
    expect(updateGmailSchema.safeParse({ email: "me@acme.io", appPassword: "abcdefghijklmnop" }).success).toBe(true);
  });

  it("rejects a non-email address and a non-app password", () => {
    const result = updateGmailSchema.safeParse({ email: "me", appPassword: "hunter2" });
    expect(result.success).toBe(false);
    expect(result.error?.flatten().fieldErrors).toEqual({
      email: ["Enter a valid email address"],
      appPassword: [APP_PASSWORD_MESSAGE],
    });
  });
});
