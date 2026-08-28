import { describe, it, expect } from "vitest";
import { formatEmailHtml } from "./format-email.js";

describe("formatEmailHtml", () => {
  it("returns empty string for empty input", () => {
    expect(formatEmailHtml("")).toBe("");
    expect(formatEmailHtml("   ")).toBe("");
  });

  it("formats paragraphs and signature into responsive HTML", () => {
    const raw = `Hi Team,

I am excited to apply for the Backend Engineer position.

Regards,
Alex Johnson
Software Engineer
Phone: +1-555-0199
Email: alex@example.com
LinkedIn: https://linkedin.com/in/alex-johnson
GitHub: https://github.com/alex-johnson
Portfolio: https://alexjohnson.dev`;

    const html = formatEmailHtml(raw);

    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("<p style=");
    expect(html).toContain("Hi Team,");
    expect(html).toContain("I am excited to apply");
    expect(html).toContain("Alex Johnson");
    expect(html).toContain("href=\"tel:+1-555-0199\"");
    expect(html).toContain("href=\"mailto:alex@example.com\"");
    expect(html).toContain("LinkedIn");
    expect(html).toContain("GitHub");
    expect(html).toContain("Portfolio");
  });
});
