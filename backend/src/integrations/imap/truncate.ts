/**
 * Body text reduction — pure, dependency-free.
 *
 * We deliberately do not use mailparser. Everything downstream (rule matching, a
 * ~300 char snippet, a classifier prompt capped at ~1200 chars) needs readable
 * text, not a faithful MIME tree, and pulling in a full parser would mean
 * buffering whole messages including attachment bytes.
 */

const BLOCK_TAG_RE = /<\/?(?:p|div|br|tr|li|h[1-6]|table|blockquote|section|article|header|footer)\b[^>]*>/gi;
const SCRIPT_STYLE_RE = /<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi;
const TAG_RE = /<[^>]+>/g;

const ENTITIES: Record<string, string> = {
  "&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"',
  "&#39;": "'", "&apos;": "'", "&mdash;": "—", "&ndash;": "–", "&hellip;": "…",
  "&rsquo;": "'", "&lsquo;": "'", "&rdquo;": '"', "&ldquo;": '"',
};

function decodeEntities(s: string): string {
  let out = s;
  for (const [entity, char] of Object.entries(ENTITIES)) {
    out = out.split(entity).join(char);
  }
  // Numeric entities — bounded to valid code points, malformed ones are left alone.
  return out.replace(/&#(\d{1,7});/g, (m, d) => {
    const n = Number(d);
    return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : m;
  });
}

/** Flatten HTML to plain text, good enough for bucketing and a snippet. */
export function htmlToText(html: string): string {
  if (!html) return "";
  return decodeEntities(
    html
      .replace(SCRIPT_STYLE_RE, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(BLOCK_TAG_RE, "\n")
      .replace(TAG_RE, " "),
  )
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t ]+/g, " ")
    // Collapses every run of blank lines to a single newline. Paragraph spacing is
    // not worth preserving here — this text feeds rule matching and a snippet.
    .replace(/ *\n+ */g, "\n")
    .trim();
}

const QUOTE_MARKERS: RegExp[] = [
  /^-{2,}\s*original message\s*-{2,}/im,
  /^-{2,}\s*forwarded message\s*-{2,}/im,
  /^on .{1,120}\bwrote:\s*$/im,
  /^from:\s.+$/im,
  /^sent from my /im,
];

/**
 * Cut a reply chain off the bottom. A thread's quoted history is mostly the same
 * text repeated, which would otherwise dominate both rule matching and the
 * classifier prompt and push the part that actually differs out of the window.
 */
export function stripQuotedReply(text: string): string {
  if (!text) return "";
  let cut = text.length;
  for (const re of QUOTE_MARKERS) {
    const m = re.exec(text);
    // Ignore a marker at the very top — that IS the message.
    if (m && m.index > 40 && m.index < cut) cut = m.index;
  }
  const lines = text.slice(0, cut).split("\n");
  while (lines.length && /^\s*>/.test(lines[lines.length - 1]!)) lines.pop();
  return lines.join("\n").trim();
}

/** Single-line preview for the message list. */
export function toSnippet(text: string, n: number): string {
  const flat = (text ?? "").replace(/\s+/g, " ").trim();
  if (flat.length <= n) return flat;
  return `${flat.slice(0, Math.max(0, n - 1)).trimEnd()}…`;
}

/**
 * Raw part body → the text we store. Truncation happens on a whitespace boundary
 * where one is nearby, so a cut never lands mid-word.
 */
export function toClassifiableText(raw: string, isHtml: boolean, maxChars: number): string {
  if (!raw) return "";
  const flattened = isHtml ? htmlToText(raw) : raw.replace(/\r\n?/g, "\n");
  const stripped = stripQuotedReply(flattened).replace(/[ \t ]+/g, " ").trim();
  if (stripped.length <= maxChars) return stripped;

  const hard = stripped.slice(0, maxChars);
  const lastBreak = Math.max(hard.lastIndexOf(" "), hard.lastIndexOf("\n"));
  return (lastBreak > maxChars * 0.8 ? hard.slice(0, lastBreak) : hard).trimEnd();
}
