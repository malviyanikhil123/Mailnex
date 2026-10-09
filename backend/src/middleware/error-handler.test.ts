import { describe, it, expect } from "vitest";
import { z } from "zod";
import { zodErrorMessage } from "./error-handler.js";

function errorOf(schema: z.ZodTypeAny, value: unknown) {
  const result = schema.safeParse(value);
  if (result.success) throw new Error("expected a validation error");
  return result.error;
}

describe("zodErrorMessage", () => {
  it("prefixes the first issue with its field", () => {
    expect(zodErrorMessage(errorOf(z.object({ email: z.string() }), {}))).toBe("email: Required");
  });

  it("joins nested paths", () => {
    const schema = z.object({ fields: z.array(z.object({ key: z.string().min(1, "Key is required") })) });
    expect(zodErrorMessage(errorOf(schema, { fields: [{ key: "" }] }))).toBe("fields.0.key: Key is required");
  });

  it("leaves top-level issues unprefixed", () => {
    expect(zodErrorMessage(errorOf(z.string().email("Enter a valid email"), "nope"))).toBe("Enter a valid email");
  });
});
