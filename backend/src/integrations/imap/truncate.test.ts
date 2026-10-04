import { describe, it, expect } from "vitest";
import { htmlToText, stripQuotedReply, toSnippet, toClassifiableText } from "./truncate.js";

describe("htmlToText", () => {
  it("returns empty string for empty input", () => {
    expect(htmlToText("")).toBe("");
  });

  it("strips tags and keeps the readable text", () => {
    expect(htmlToText("<p>Hello <b>world</b></p>")).toBe("Hello world");
  });

  it("drops script and style content entirely", () => {
    const html = "<style>.a{color:red}</style><p>Keep me</p><script>alert(1)</script>";
    const out = htmlToText(html);
    expect(out).toContain("Keep me");
    expect(out).not.toContain("color:red");
    expect(out).not.toContain("alert");
  });

  it("drops HTML comments", () => {
    expect(htmlToText("<p>A<!-- hidden -->B</p>")).not.toContain("hidden");
  });

  it("turns block tags into line breaks", () => {
    expect(htmlToText("<div>One</div><div>Two</div>")).toBe("One\nTwo");
    expect(htmlToText("Line1<br>Line2")).toBe("Line1\nLine2");
  });

  it("decodes the common named entities", () => {
    expect(htmlToText("<p>Tom&nbsp;&amp;&nbsp;Jerry &lt;3 &quot;quoted&quot;</p>"))
      .toBe('Tom & Jerry <3 "quoted"');
  });

  it("decodes numeric entities and leaves malformed ones alone", () => {
    expect(htmlToText("<p>&#65;&#66;</p>")).toBe("AB");
    expect(htmlToText("<p>&#99999999;</p>")).toContain("&#99999999;");
  });

  it("collapses every run of blank lines to a single newline", () => {
    expect(htmlToText("<p>A</p><p></p><p></p><p>B</p>")).toBe("A\nB");
  });
});

describe("stripQuotedReply", () => {
  it("returns empty string for empty input", () => {
    expect(stripQuotedReply("")).toBe("");
  });

  it("cuts an 'On ... wrote:' reply chain", () => {
    const text = "Thanks, that works for me and I will be there.\n\nOn Mon, 2 Oct 2025, Alice wrote:\nOriginal question here";
    const out = stripQuotedReply(text);
    expect(out).toContain("Thanks, that works");
    expect(out).not.toContain("Original question here");
  });

  it("cuts an Original Message separator", () => {
    const text = "My reply is here and it is long enough to pass the top guard.\n------ Original Message ------\nold stuff";
    expect(stripQuotedReply(text)).not.toContain("old stuff");
  });

  it("drops trailing '>' quoted lines", () => {
    const text = "Short answer: yes, that is fine by me.\n> previous line one\n> previous line two";
    const out = stripQuotedReply(text);
    expect(out).toBe("Short answer: yes, that is fine by me.");
  });

  it("does not cut a marker at the very top — that IS the message", () => {
    const text = "From: recruiter@corp.com\nWe would like to invite you to interview.";
    expect(stripQuotedReply(text)).toContain("invite you to interview");
  });
});

describe("toSnippet", () => {
  it("flattens whitespace onto one line", () => {
    expect(toSnippet("a\n\n  b\tc", 100)).toBe("a b c");
  });

  it("returns the text unchanged when it is short enough", () => {
    expect(toSnippet("short", 10)).toBe("short");
  });

  it("truncates with an ellipsis and never exceeds the cap", () => {
    const out = toSnippet("a".repeat(50), 10);
    expect(out.length).toBeLessThanOrEqual(10);
    expect(out.endsWith("…")).toBe(true);
  });

  it("handles empty input", () => {
    expect(toSnippet("", 10)).toBe("");
  });
});

describe("toClassifiableText", () => {
  it("returns empty string for empty input", () => {
    expect(toClassifiableText("", false, 100)).toBe("");
    expect(toClassifiableText("", true, 100)).toBe("");
  });

  it("flattens HTML when isHtml is true", () => {
    expect(toClassifiableText("<p>Hello <b>you</b></p>", true, 100)).toBe("Hello you");
  });

  it("leaves plain text as text, normalizing CRLF", () => {
    expect(toClassifiableText("line1\r\nline2", false, 100)).toBe("line1\nline2");
  });

  it("caps the output at maxChars", () => {
    const out = toClassifiableText("word ".repeat(5000), false, 800);
    expect(out.length).toBeLessThanOrEqual(800);
  });

  it("cuts on a whitespace boundary rather than mid-word when one is near", () => {
    const text = `${"alpha beta ".repeat(20)}gammagammagamma`;
    const out = toClassifiableText(text, false, 100);
    expect(out).not.toMatch(/\s$/);
    // The cut landed on a boundary, so the final token is a whole word.
    expect(out.split(" ").pop()).toMatch(/^(alpha|beta)$/);
  });

  it("falls back to a hard cut when there is no nearby whitespace", () => {
    const out = toClassifiableText("x".repeat(500), false, 100);
    expect(out.length).toBe(100);
  });

  it("strips a quoted reply before applying the cap", () => {
    const text = "My actual answer to the question being asked.\n\nOn Mon, Alice wrote:\n" + "noise ".repeat(500);
    const out = toClassifiableText(text, false, 8000);
    expect(out).toContain("My actual answer");
    expect(out).not.toContain("noise");
  });
});
