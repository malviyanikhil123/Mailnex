import { describe, it, expect } from "vitest";
import Fastify from "fastify";
import { z } from "zod";
import { registerErrorHandler, zodErrorMessage } from "./error-handler.js";

async function appThrowing(err: Error) {
  const app = Fastify({ logger: false });
  registerErrorHandler(app);
  app.get("/", async () => {
    throw err;
  });
  return app;
}

describe("error handler", () => {
  it("hides the message of an unexpected 5xx", async () => {
    const app = await appThrowing(Object.assign(new Error("db password is hunter2"), { statusCode: 500 }));
    const res = await app.inject({ method: "GET", url: "/" });
    expect(res.statusCode).toBe(500);
    expect(res.json().message).toBe("Internal Server Error");
    await app.close();
  });

  it("passes through the message of a 5xx marked expose (an upstream failure meant for the user)", async () => {
    const app = await appThrowing(Object.assign(new Error("Could not reach OpenAI"), { statusCode: 502, expose: true }));
    const res = await app.inject({ method: "GET", url: "/" });
    expect(res.statusCode).toBe(502);
    expect(res.json()).toEqual({ error: "UpstreamError", message: "Could not reach OpenAI" });
    await app.close();
  });
});

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
