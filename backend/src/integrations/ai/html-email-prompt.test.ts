import { describe, it, expect } from "vitest";
import { buildHtmlEmailPrompt, extractHtmlDocument } from "./html-email-prompt.js";

const DOC = "<!DOCTYPE html>\n<html><body><p>Hi</p></body></html>";

describe("extractHtmlDocument", () => {
  it("returns a bare document unchanged", () => {
    expect(extractHtmlDocument(DOC)).toBe(DOC);
  });

  it("strips ```html fences and the text around them", () => {
    expect(extractHtmlDocument("Here you go:\n```html\n" + DOC + "\n```\nEnjoy!")).toBe(DOC);
    expect(extractHtmlDocument("```\n" + DOC + "\n```")).toBe(DOC);
  });

  it("handles an answer cut off before its closing fence", () => {
    expect(extractHtmlDocument("```html\n<!DOCTYPE html>\n<html><body><p>Hi")).toBe("<!DOCTYPE html>\n<html><body><p>Hi");
  });

  it("drops chatter before the doctype and after </html>", () => {
    expect(extractHtmlDocument("Sure!\n" + DOC + "\nHope this helps.")).toBe(DOC);
  });

  it("returns a fragment when there is no full document", () => {
    expect(extractHtmlDocument("<table><tr><td>x</td></tr></table>")).toBe("<table><tr><td>x</td></tr></table>");
  });

  it("returns an empty string when there is no markup at all", () => {
    expect(extractHtmlDocument("I can't help with that.")).toBe("");
  });
});

describe("buildHtmlEmailPrompt", () => {
  it("asks for an email-safe, self-contained document", () => {
    const { system } = buildHtmlEmailPrompt({ description: "Newsletter", includeVariables: true });
    expect(system).toMatch(/<!DOCTYPE html>/);
    expect(system).toMatch(/600/);
    expect(system).toMatch(/inline style/i);
    expect(system).toMatch(/No JavaScript/);
    expect(system).toMatch(/<title>/);
  });

  it("lists the variables, or forbids them", () => {
    const withVars = buildHtmlEmailPrompt({ description: "x", includeVariables: true }).system;
    for (const v of ["{{first_name|there}}", "{{company}}", "{{my_name}}", "{{signature}}"]) expect(withVars).toContain(v);
    const without = buildHtmlEmailPrompt({ description: "x", includeVariables: false }).system;
    expect(without).toContain("Do not use any {{placeholders}}");
    expect(without).not.toContain("{{my_name}}");
  });

  it("puts the description, tone and brand color in the prompt, with defaults", () => {
    const { prompt } = buildHtmlEmailPrompt({ description: "  Launch of our app  ", tone: "bold", brandColor: "#0ea5e9", includeVariables: true });
    expect(prompt).toContain('"""\nLaunch of our app\n"""');
    expect(prompt).toContain("Tone: bold.");
    expect(prompt).toContain("Brand color: #0ea5e9");
    const plain = buildHtmlEmailPrompt({ description: "Launch", includeVariables: true }).prompt;
    expect(plain).toContain("Tone: professional and friendly.");
    expect(plain).toContain("Brand color: none given");
  });
});
