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

/** An on* event-handler attribute inside a real tag. */
const EVENT_ATTR = /<[a-z][^>]*\son\w+\s*=\s*["']/i;

describe("formatEmailHtml with untrusted text", () => {
  it("shows markup from contact fields as text instead of rendering it", () => {
    const html = formatEmailHtml(`Hi team at <a href="https://evil">x</a>,\n\nI <script>alert(1)</script> like it.`);
    expect(html).not.toContain(">x</a>");
    expect(html).not.toContain("<script");
    expect(html).toContain("&lt;a href=");
    expect(html).toContain("&gt;x&lt;/a&gt;");
  });

  it("does not let a quote in a URL break out of the href", () => {
    const html = formatEmailHtml(`See https://x.io/"onmouseover="alert(1) for details.`);
    expect(html).not.toMatch(EVENT_ATTR);
    expect(html).toContain('href="https://x.io/"');
    // The rest of the value stays outside the link, as text.
    expect(html).toMatch(/https:\/\/x\.io\/<\/a>(&quot;|")onmouseover=/);
  });

  it("keeps a query string intact and escaped in the link", () => {
    const html = formatEmailHtml("Docs: https://x.io/p?a=1&b=2 here");
    expect(html).toContain('href="https://x.io/p?a=1&amp;b=2"');
  });

  it("escapes signature lines and drops non-http badge links", () => {
    const html = formatEmailHtml(
      "Hello\n\nRegards,\n<b>Eve</b>\nLinkedIn: javascript:alert(1)\nEmail: a@b.co\" onclick=\"x",
    );
    expect(html).not.toContain("<b>Eve</b>");
    expect(html).toContain("&lt;b&gt;Eve&lt;/b&gt;");
    expect(html).not.toContain("javascript:");
    expect(html).not.toMatch(EVENT_ATTR);
  });

  it("returns a sanitized document that stays the same when sanitized again", async () => {
    const { sanitizeEmailHtml } = await import("./email-html.js");
    const html = formatEmailHtml("Hi,\n\nVisit https://example.com\n\nRegards,\nAlex");
    expect(html.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(sanitizeEmailHtml(html)).toBe(html);
    expect(html).toContain('href="https://example.com"');
  });
});
