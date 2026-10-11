import { describe, it, expect } from "vitest";
import { buildPersonalizationPrompt } from "./prompt.js";

describe("buildPersonalizationPrompt()", () => {
  const baseInput = {
    subject: "Application for Software Engineer",
    body: "Dear Hiring Manager, I am applying for the role.",
    company: "Acme Corp",
    location: "New York",
    senderName: "Alice Smith",
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

  it("labels the sender's name as the sender", () => {
    const prompt = buildPersonalizationPrompt(baseInput);
    expect(prompt).toContain("SENDER NAME: Alice Smith");
    expect(prompt).not.toMatch(/candidate/i);
  });

  it("asks for the company and location to be mentioned when they are known", () => {
    const prompt = buildPersonalizationPrompt(baseInput);
    expect(prompt).toContain('Mention "Acme Corp" and "New York" naturally');
    expect(prompt).toContain("COMPANY: Acme Corp");
    expect(prompt).toContain("LOCATION: New York");
  });

  it("leaves out the company and location when the contact has neither", () => {
    const prompt = buildPersonalizationPrompt({ ...baseInput, company: "", location: null });
    expect(prompt).not.toContain("COMPANY:");
    expect(prompt).not.toContain("LOCATION:");
    expect(prompt).not.toMatch(/Mention ""/);
    expect(prompt).toContain("company and location are unknown");
  });

  it("mentions only the value that is known", () => {
    const prompt = buildPersonalizationPrompt({ ...baseInput, company: "  ", location: "Pune" });
    expect(prompt).toContain('Mention "Pune" naturally');
    expect(prompt).toContain("LOCATION: Pune");
    expect(prompt).not.toContain("COMPANY:");
  });

  it("includes the contact's first name only when given", () => {
    expect(buildPersonalizationPrompt(baseInput)).not.toContain("CONTACT FIRST NAME");
    expect(buildPersonalizationPrompt({ ...baseInput, firstName: "Priya" })).toContain("CONTACT FIRST NAME: Priya");
  });

  it("adds the language rule and sender instructions only when given", () => {
    const plain = buildPersonalizationPrompt(baseInput);
    expect(plain).not.toContain("must be written in");
    expect(plain).not.toContain("ADDITIONAL INSTRUCTIONS");

    const prompt = buildPersonalizationPrompt({ ...baseInput, language: "Hindi", instructions: "Mention the 20% launch offer." });
    expect(prompt).toContain("must be written in Hindi");
    expect(prompt).toContain("Mention the 20% launch offer.");
  });

  it("includes the 'do not invent facts' constraint", () => {
    const prompt = buildPersonalizationPrompt(baseInput);
    // case-insensitive check for some variant of "invent"
    expect(prompt.toLowerCase()).toContain("invent");
  });
});
