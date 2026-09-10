import { describe, it, expect } from "vitest";
import { extractEmailsFromHtml } from "./extractor.js";

describe("extractEmailsFromHtml", () => {
  it("extracts emails from mailto: links and raw text", () => {
    const html = `
      <div>
        <p>Get in touch with us at <a href="mailto:careers@innovatetech.com">careers@innovatetech.com</a></p>
        <p>For urgent recruiting inquiries: recruitment@innovatetech.com</p>
      </div>
    `;

    const emails = extractEmailsFromHtml(html, "https://innovatetech.com/contact");
    const normalized = emails.map((e) => e.normalizedEmail);

    expect(normalized).toContain("careers@innovatetech.com");
    expect(normalized).toContain("recruitment@innovatetech.com");
  });

  it("filters out fake placeholders and image assets", () => {
    const html = `
      <div>
        <img src="logo@2x.png" />
        <a href="mailto:icon@sample.com">Sample</a>
        <p>Valid: hr@company.io</p>
        <p>Invalid: support@sentry.io</p>
      </div>
    `;

    const emails = extractEmailsFromHtml(html, "https://company.io");
    const normalized = emails.map((e) => e.normalizedEmail);

    expect(normalized).toContain("hr@company.io");
    expect(normalized).not.toContain("logo@2x.png");
    expect(normalized).not.toContain("icon@sample.com");
    expect(normalized).not.toContain("support@sentry.io");
  });

  it("normalizes mixed-case emails", () => {
    const html = `<p>Email: HR.Manager@ACME-CORP.com</p>`;
    const emails = extractEmailsFromHtml(html);
    expect(emails[0].normalizedEmail).toBe("hr.manager@acme-corp.com");
  });
});
