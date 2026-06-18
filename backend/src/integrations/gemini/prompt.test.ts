import { describe, it, expect } from "vitest";
import { buildPersonalizationPrompt } from "./prompt.js";

describe("buildPersonalizationPrompt()", () => {
  const baseInput = {
    subject: "Application for Software Engineer",
    body: "Dear Hiring Manager, I am applying for the role.",
    company: "Acme Corp",
    location: "New York",
    candidateName: "Alice Smith",
  };

  it("includes the company name in the prompt", () => {
    const prompt = buildPersonalizationPrompt(baseInput);
    expect(prompt).toContain("Acme Corp");
  });

  it("includes the location in the prompt", () => {
    const prompt = buildPersonalizationPrompt(baseInput);
    expect(prompt).toContain("New York");
  });

  it("includes the JSON output instruction", () => {
    const prompt = buildPersonalizationPrompt(baseInput);
    expect(prompt).toContain('"subject"');
    expect(prompt).toContain('"body"');
  });

  it("includes the original subject in the prompt", () => {
    const prompt = buildPersonalizationPrompt(baseInput);
    expect(prompt).toContain(baseInput.subject);
  });

  it("includes the original body in the prompt", () => {
    const prompt = buildPersonalizationPrompt(baseInput);
    expect(prompt).toContain(baseInput.body);
  });

  it("includes the candidate name in the prompt", () => {
    const prompt = buildPersonalizationPrompt(baseInput);
    expect(prompt).toContain("Alice Smith");
  });

  it("includes the 'do not invent facts' constraint", () => {
    const prompt = buildPersonalizationPrompt(baseInput);
    // case-insensitive check for some variant of "invent"
    expect(prompt.toLowerCase()).toContain("invent");
  });
});
