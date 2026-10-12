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

  it("renders a present-but-empty key as an empty string", () => {
    expect(interpolate("Hi {{first_name}}!", { first_name: "" })).toBe("Hi !");
  });

  describe("{{key|fallback}}", () => {
    it("uses the value when it is filled in", () => {
      expect(interpolate("Hi {{first_name|there}},", { first_name: "Maya" })).toBe("Hi Maya,");
    });

    it("uses the fallback when the value is empty, blank or missing", () => {
      expect(interpolate("Hi {{first_name|there}},", { first_name: "" })).toBe("Hi there,");
      expect(interpolate("Hi {{first_name|there}},", { first_name: "   " })).toBe("Hi there,");
      expect(interpolate("Hi {{first_name|there}},", {})).toBe("Hi there,");
    });

    it("tolerates spaces around the key and the fallback", () => {
      expect(interpolate("Hi {{ first_name | there }},", {})).toBe("Hi there,");
      expect(interpolate("Hi {{ first_name | there }},", { first_name: "Maya" })).toBe("Hi Maya,");
    });

    it("keeps inner spaces of a multi-word fallback and allows an empty one", () => {
      expect(interpolate("At {{company|your company}}.", {})).toBe("At your company.");
      expect(interpolate("Hi{{first_name|}}!", {})).toBe("Hi!");
    });

    it("matches the key case-insensitively like plain placeholders", () => {
      expect(interpolate("{{First_Name|there}}", { first_name: "Maya" })).toBe("Maya");
    });

    it("prefers an exact key that literally contains a pipe (old behavior)", () => {
      expect(interpolate("{{a|b}}", { "a|b": "literal" })).toBe("literal");
    });
  });

  describe("escape option", () => {
    const escape = (v: string) => v.replace(/</g, "&lt;").replace(/>/g, "&gt;");

    it("escapes variable values", () => {
      expect(interpolate("<p>{{company}}</p>", { company: "<b>Acme</b>" }, { escape })).toBe(
        "<p>&lt;b&gt;Acme&lt;/b&gt;</p>",
      );
    });

    it("escapes a value chosen over a fallback but inserts the fallback as written", () => {
      expect(interpolate("{{first_name|<i>there</i>}}", { first_name: "<x>" }, { escape })).toBe("&lt;x&gt;");
      expect(interpolate("{{first_name|<i>there</i>}}", {}, { escape })).toBe("<i>there</i>");
    });

    it("leaves unknown placeholders untouched", () => {
      expect(interpolate("{{unknown}}", {}, { escape })).toBe("{{unknown}}");
    });
  });

  it("handles case-insensitive variable matching (e.g. LinkedIn, GitHub, Portfolio)", () => {
    const result = interpolate(
      "GitHub: {{GitHub}}, LinkedIn: {{LinkedIn}}, Portfolio: {{Portfolio}}",
      {
        github: "https://github.com/alex",
        linkedin: "https://linkedin.com/in/alex",
        portfolio: "https://alex.dev",
      },
    );
    expect(result).toBe(
      "GitHub: https://github.com/alex, LinkedIn: https://linkedin.com/in/alex, Portfolio: https://alex.dev",
    );
  });
});
