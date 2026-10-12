import { describe, it, expect } from "vitest";
import { createTemplateSchema, updateTemplateSchema, generateHtmlSchema } from "./templates.schema.js";
import { LIMITS } from "../../config/constants.js";

const base = { name: "n", subject: "s", body: "b" };

describe("createTemplateSchema", () => {
  it("accepts both formats and leaves format out when not given", () => {
    expect(createTemplateSchema.parse(base).format).toBeUndefined();
    expect(createTemplateSchema.parse({ ...base, format: "html" }).format).toBe("html");
    expect(createTemplateSchema.safeParse({ ...base, format: "markdown" }).success).toBe(false);
  });

  it("caps the body at 100 KB (UTF-8 bytes)", () => {
    const max = LIMITS.TEMPLATE_BODY_MAX_BYTES;
    expect(createTemplateSchema.safeParse({ ...base, format: "html", body: "a".repeat(max) }).success).toBe(true);
    const tooBig = createTemplateSchema.safeParse({ ...base, format: "html", body: "a".repeat(max + 1) });
    expect(tooBig.success).toBe(false);
    expect(tooBig.error?.issues[0].message).toBe("The email body is limited to 100 KB");
    // Multi-byte characters count by their encoded size.
    expect(createTemplateSchema.safeParse({ ...base, body: "€".repeat(Math.floor(max / 3) + 1) }).success).toBe(false);
  });
});

describe("updateTemplateSchema", () => {
  it("applies the same body cap and format values", () => {
    expect(updateTemplateSchema.safeParse({ format: "text" }).success).toBe(true);
    expect(updateTemplateSchema.safeParse({ body: "a".repeat(LIMITS.TEMPLATE_BODY_MAX_BYTES + 1) }).success).toBe(false);
  });
});

describe("generateHtmlSchema", () => {
  const ok = { description: "A product launch email for our new app" };

  it("defaults includeVariables to true", () => {
    expect(generateHtmlSchema.parse(ok)).toEqual({ ...ok, includeVariables: true });
  });

  it("limits the description length", () => {
    expect(generateHtmlSchema.safeParse({ description: "short" }).success).toBe(false);
    expect(generateHtmlSchema.safeParse({ description: "x".repeat(2001) }).success).toBe(false);
    expect(generateHtmlSchema.safeParse({ description: "x".repeat(2000) }).success).toBe(true);
  });

  it("accepts a hex brand color or an empty one, nothing else", () => {
    expect(generateHtmlSchema.safeParse({ ...ok, brandColor: "#2563eb" }).success).toBe(true);
    expect(generateHtmlSchema.safeParse({ ...ok, brandColor: "#fff" }).success).toBe(true);
    expect(generateHtmlSchema.safeParse({ ...ok, brandColor: "" }).success).toBe(true);
    expect(generateHtmlSchema.safeParse({ ...ok, brandColor: "red; background:url(x)" }).success).toBe(false);
  });

  it("limits the tone, provider and model lengths", () => {
    expect(generateHtmlSchema.safeParse({ ...ok, tone: "x".repeat(61) }).success).toBe(false);
    expect(generateHtmlSchema.safeParse({ ...ok, provider: "x".repeat(41) }).success).toBe(false);
    expect(generateHtmlSchema.safeParse({ ...ok, model: "x".repeat(201) }).success).toBe(false);
  });
});
