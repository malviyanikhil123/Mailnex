import { describe, it, expect } from "vitest";
import Fastify from "fastify";
import { registerErrorHandler } from "./error-handler.js";

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
