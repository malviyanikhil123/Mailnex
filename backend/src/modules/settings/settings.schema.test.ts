import { describe, it, expect } from "vitest";
import { profileFieldsSchema, senderProfileSchema } from "./settings.schema.js";
import { APP_PASSWORD_MESSAGE } from "../../utils/app-password.js";
import { updateGmailSchema } from "./settings.schema.js";

const field = (key: string) => ({ fields: [{ key, label: "Label", value: "v" }] });

describe("profileFieldsSchema", () => {
  it.each([
    "my_name", "my_company", "my_email", "my_phone", "my_website", "my_linkedin", "signature",
    "company", "location", "first_name", "last_name", "full_name",
    "contact_email", "contact_phone", "contact_website",
    "name", "candidateName", "email", "role", "Portfolio",
  ])("rejects the built-in variable %s as a custom key", (key) => {
    expect(profileFieldsSchema.safeParse(field(key)).success).toBe(false);
  });

  it("accepts an ordinary custom key", () => {
    expect(profileFieldsSchema.safeParse(field("booking_link")).success).toBe(true);
  });
});

describe("senderProfileSchema", () => {
  it("accepts the generic profile fields including a multi-line signature", () => {
    const input = {
      name: "Priya Shah", company: "Acme", email: "p@acme.com", phone: "+1 555",
      website: "https://acme.com", linkedin: "https://linkedin.com/in/p", signature: "Thanks,\nPriya",
    };
    expect(senderProfileSchema.parse(input)).toEqual(input);
  });

  it("drops job-seeker fields the form no longer edits", () => {
    expect(senderProfileSchema.parse({ name: "P", role: "Engineer", skills: ["x"] })).toEqual({ name: "P" });
  });
});

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
