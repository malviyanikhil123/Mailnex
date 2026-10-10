import { describe, it, expect } from "vitest";
import { interpolate, renderHtmlPreview, safePreviewHtml, sampleVars, textToHtml, looksLikeHtml, escapeHtml } from "./variables";

describe("interpolate (mirrors the server)", () => {
  it("fills known keys case-insensitively and leaves unknown ones", () => {
    expect(interpolate("Hi {{First_Name}} from {{industry}}", { first_name: "Maya" })).toBe("Hi Maya from {{industry}}");
  });

  it("supports {{key|fallback}} for blank or missing values", () => {
    expect(interpolate("Hi {{first_name|there}},", { first_name: "" })).toBe("Hi there,");
    expect(interpolate("Hi {{ first_name | there }},", {})).toBe("Hi there,");
    expect(interpolate("Hi {{first_name|there}},", { first_name: "Maya" })).toBe("Hi Maya,");
  });
});

describe("renderHtmlPreview", () => {
  it("escapes values so sample data cannot inject markup", () => {
    const out = renderHtmlPreview("<p>{{company}}</p>", { company: "<img src=x onerror=alert(1)>" });
    expect(out).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(out).not.toContain("<img");
  });

  it("keeps line breaks of multi-line values", () => {
    expect(renderHtmlPreview("<p>{{signature}}</p>", { signature: "Best regards,\nAlex" })).toContain("Best regards,<br>Alex");
  });
});

describe("safePreviewHtml", () => {
  it("keeps the document, head styles and inline styles but removes scripts and handlers", () => {
    const out = safePreviewHtml(
      '<!DOCTYPE html><html><head><style>.x{color:red}</style></head><body><p class="x" style="font-size:16px" onclick="alert(1)">Hi</p><script>alert(1)</script><a href="javascript:alert(1)">x</a></body></html>',
    );
    expect(out).toContain("<style>.x{color:red}</style>");
    expect(out).toContain('style="font-size:16px"');
    expect(out).not.toMatch(/<script|onclick|javascript:/);
  });
});

describe("sampleVars", () => {
  it("uses the real profile, custom fields and a sample contact; built-ins win", () => {
    const vars = sampleVars({ name: "Priya Shah", company: "Northwind" }, [
      { key: "offer", label: "Offer", value: "20% off" },
      { key: "company", label: "Clash", value: "WRONG" },
    ]);
    expect(vars.my_name).toBe("Priya Shah");
    expect(vars.my_company).toBe("Northwind");
    expect(vars.offer).toBe("20% off");
    expect(vars.company).toBe("Acme Co");
    expect(vars.first_name).toBe("Jordan");
    expect(vars.signature).toBe("Best regards,\nPriya Shah\nNorthwind\nhttps://example.com");
  });

  it("prefers a custom signature", () => {
    expect(sampleVars({ signature: "Cheers,\nP" }).signature).toBe("Cheers,\nP");
  });
});

describe("helpers", () => {
  it("textToHtml turns paragraphs into <p> with <br> line breaks", () => {
    expect(textToHtml("Hi {{first_name|there}},\n\nLine 1\nLine <2>")).toBe(
      "<p>Hi {{first_name|there}},</p>\n<p>Line 1<br>Line &lt;2&gt;</p>",
    );
  });

  it("looksLikeHtml spots markup but not plain text", () => {
    expect(looksLikeHtml("<table><tr><td>x</td></tr></table>")).toBe(true);
    expect(looksLikeHtml("Price < 10 and > 5")).toBe(false);
  });

  it("escapeHtml escapes quotes too", () => {
    expect(escapeHtml(`"a" & 'b'`)).toBe("&quot;a&quot; &amp; &#39;b&#39;");
  });
});
