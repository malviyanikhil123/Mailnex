import { describe, it, expect } from "vitest";
import { interpolate } from "./interpolate.js";

describe("interpolate", () => {
  it("replaces a single {{key}} placeholder", () => {
    expect(interpolate("Hi {{company}}", { company: "X" })).toBe("Hi X");
  });

  it("replaces multiple placeholders", () => {
    const result = interpolate("Dear {{name}}, from {{company}}", {
      name: "Alice",
      company: "Acme",
    });
    expect(result).toBe("Dear Alice, from Acme");
  });

  it("replaces the same placeholder multiple times", () => {
    const result = interpolate("{{a}} and {{a}}", { a: "yes" });
    expect(result).toBe("yes and yes");
  });

  it("leaves placeholder intact when key is missing", () => {
    const result = interpolate("Hi {{missing}}", {});
    expect(result).toBe("Hi {{missing}}");
  });

  it("returns the template unchanged when no placeholders", () => {
    expect(interpolate("No placeholders here", { key: "val" })).toBe(
      "No placeholders here",
    );
  });

  it("handles empty template string", () => {
    expect(interpolate("", { key: "val" })).toBe("");
  });

  it("replaces a hyphenated key {{first-name}}", () => {
    expect(interpolate("Hi {{first-name}}", { "first-name": "Alice" })).toBe(
      "Hi Alice",
    );
  });

  it("replaces a key with surrounding spaces {{ company }}", () => {
    expect(interpolate("Welcome to {{ company }}!", { company: "Acme" })).toBe(
      "Welcome to Acme!",
    );
  });

  it("leaves an unknown key {{unknown}} untouched", () => {
    expect(interpolate("Hi {{unknown}}", {})).toBe("Hi {{unknown}}");
  });
});
