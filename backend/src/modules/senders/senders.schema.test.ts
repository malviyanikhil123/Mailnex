import { describe, it, expect } from "vitest";
import { APP_PASSWORD_MESSAGE } from "../../utils/app-password.js";
import { createSenderSchema, updateSenderSchema } from "./senders.schema.js";

describe("createSenderSchema", () => {
  const valid = { label: "Sales", email: " Sales@Company.com ", appPassword: "abcd efgh ijkl mnop" };

  it("normalizes the email and the app password (any domain, e.g. Google Workspace)", () => {
    expect(createSenderSchema.parse(valid)).toEqual({
      label: "Sales",
      email: "sales@company.com",
      appPassword: "abcdefghijklmnop",
      dailyLimit: 50,
    });
  });

  it("rejects an app password that is not the 16-letter code", () => {
    const result = createSenderSchema.safeParse({ ...valid, appPassword: "my gmail password" });
    expect(result.success).toBe(false);
    expect(result.error?.flatten().fieldErrors.appPassword).toEqual([APP_PASSWORD_MESSAGE]);
  });

  it("rejects an invalid email", () => {
    const result = createSenderSchema.safeParse({ ...valid, email: "sales@" });
    expect(result.error?.flatten().fieldErrors.email).toEqual(["Enter a valid email address"]);
  });
});

describe("updateSenderSchema", () => {
  it("leaves the app password out when it is not being changed", () => {
    expect(updateSenderSchema.parse({ active: false })).toEqual({ active: false });
  });

  it("validates and normalizes a new app password", () => {
    expect(updateSenderSchema.parse({ appPassword: "ABCD-EFGH-IJKL-MNOP" }).appPassword).toBe("abcdefghijklmnop");
    expect(updateSenderSchema.safeParse({ appPassword: "abc" }).success).toBe(false);
  });
});
