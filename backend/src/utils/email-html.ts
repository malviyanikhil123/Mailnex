/**
 * HTML email helpers: the allowlist sanitizer for user/AI-written email designs, the
 * escaping used when variables are filled into them, and the plain-text alternative
 * sent next to the HTML.
 *
 * Sanitizer policy (sanitize-html, allowlist):
 *  - Tags: document structure (html/head/body/title/meta/style), tables, block and
 *    inline text formatting, lists, links and images. Everything else is dropped —
 *    script, iframe, object, embed, form/input/button, base, link, svg, math, video…
 *    Comments (incl. Outlook conditional comments) and the doctype are dropped; a
 *    `<!DOCTYPE html>` is put back when the result is a full document.
 *  - Attributes: presentational ones (style, class, id, align, width, bgcolor…), plus
 *    href/target/rel/name on links, src/alt on images and charset/name/content on meta
 *    (no http-equiv, so no meta refresh). No on* handlers.
 *  - URLs: links may use http, https, mailto and tel; images https, cid and
 *    data:image/(png|gif|jpeg|webp) (no SVG). Note Gmail does not show data: images, so
 *    https (or cid) is what designs should use. Relative URLs are kept because a
 *    template writes href="{{my_website}}" — the HTML is sanitized again after the
 *    variables are filled in, so the real URL is checked before anything is sent.
 *    Protocol-relative (//host) URLs are dropped.
 *  - CSS: inline style declarations are kept one by one; a declaration is dropped when
 *    it uses expression(), javascript:/vbscript: URLs, behavior / -moz-binding,
 *    @import, CSS escapes (\), markup characters, or a url() that is not https or an
 *    inline raster image. A `<style>` block is kept only if the whole sheet passes the
 *    same checks (after comments are removed), otherwise the block is dropped.
 */
import sanitizeHtml from "sanitize-html";
import { interpolate } from "./interpolate.js";

const ALLOWED_TAGS = [
  "html", "head", "body", "title", "meta", "style",
  "table", "thead", "tbody", "tfoot", "tr", "td", "th", "caption", "colgroup", "col",
  "div", "span", "p", "br", "hr", "center", "font",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "strong", "b", "em", "i", "u", "s", "strike", "small", "big", "sub", "sup", "mark", "del", "ins",
  "blockquote", "pre", "code", "abbr", "address", "cite", "q", "time", "wbr",
  "ul", "ol", "li", "dl", "dt", "dd",
  "a", "img",
  "section", "article", "header", "footer", "main", "figure", "figcaption",
];

const ALLOWED_ATTRIBUTES: Record<string, string[]> = {
  "*": ["style", "class", "id", "align", "valign", "width", "height", "bgcolor", "border", "dir", "lang", "title", "role"],
  a: ["href", "target", "rel", "name"],
  img: ["src", "alt"],
  table: ["cellpadding", "cellspacing", "summary"],
  td: ["colspan", "rowspan", "nowrap", "scope"],
  th: ["colspan", "rowspan", "nowrap", "scope"],
  col: ["span"],
  colgroup: ["span"],
  font: ["color", "face", "size"],
  ol: ["start", "type"],
  ul: ["type"],
  li: ["value"],
  time: ["datetime"],
  meta: ["charset", "name", "content"],
  style: ["type", "media"],
};

/** Elements whose content is dropped together with them. */
const DROP_WITH_CONTENT = [
  "script", "textarea", "option", "select", "noscript", "noembed", "noframes", "template",
  "xmp", "iframe", "object", "applet", "frameset", "svg", "math",
];

const INLINE_IMAGE = /^data:image\/(png|gif|jpe?g|webp)[;,]/;
const DANGEROUS_CSS = /expression\(|javascript:|vbscript:|livescript:|-moz-binding|behavior:|@import/;

/** Lower-cased with whitespace and control characters removed, as browsers read URLs. */
function compact(value: string): string {
  return value.replace(/[\x00-\x20\x7f]+/g, "").toLowerCase();
}

function isAllowedImageSrc(src: string): boolean {
  const c = compact(src);
  return !c.startsWith("data:") || INLINE_IMAGE.test(c);
}

/** Every url(…) points at https or an inline raster image. */
function cssUrlsAllowed(css: string): boolean {
  const c = compact(css);
  let i = c.indexOf("url(");
  while (i !== -1) {
    const target = c.slice(i + 4).replace(/^['"]/, "");
    if (!target.startsWith("https://") && !INLINE_IMAGE.test(target)) return false;
    i = c.indexOf("url(", i + 4);
  }
  return true;
}

function cssValueAllowed(css: string): boolean {
  if (/[\\<]/.test(css)) return false;
  return !DANGEROUS_CSS.test(compact(css)) && cssUrlsAllowed(css);
}

function stripCssComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\*[\s\S]*$/, "");
}

/** Splits a declaration list on `;` outside quotes and parentheses (data: URLs contain `;`). */
function splitDeclarations(css: string): string[] {
  const out: string[] = [];
  let current = "";
  let quote = "";
  let depth = 0;
  for (const ch of css) {
    if (quote) {
      if (ch === quote) quote = "";
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === "(") {
      depth++;
    } else if (ch === ")") {
      depth = Math.max(0, depth - 1);
    } else if (ch === ";" && depth === 0) {
      out.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  out.push(current);
  return out;
}

/** Filters an inline `style` attribute declaration by declaration; "" when nothing is left. */
export function sanitizeInlineCss(css: string): string {
  const kept: string[] = [];
  for (const declaration of splitDeclarations(stripCssComments(css))) {
    const colon = declaration.indexOf(":");
    if (colon <= 0) continue;
    const property = declaration.slice(0, colon).trim().toLowerCase();
    const value = declaration.slice(colon + 1).trim();
    if (!value || !/^-?[a-z][a-z0-9-]*$/.test(property)) continue;
    if (property === "behavior" || property === "-moz-binding") continue;
    if (!cssValueAllowed(value)) continue;
    kept.push(`${property}: ${value}`);
  }
  return kept.join("; ");
}

/** A `<style>` sheet without comments, or "" when any part of it is unsafe. */
export function sanitizeStyleSheet(css: string): string {
  const sheet = stripCssComments(css).trim();
  return cssValueAllowed(sheet) ? sheet : "";
}

const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ALLOWED_TAGS,
  allowedAttributes: ALLOWED_ATTRIBUTES,
  allowedSchemes: ["http", "https", "mailto", "tel"],
  allowedSchemesByTag: { img: ["https", "cid", "data"] },
  allowedSchemesAppliedToAttributes: ["href", "src"],
  allowProtocolRelative: false,
  disallowedTagsMode: "discard",
  nonTextTags: DROP_WITH_CONTENT,
  // <style> is allowed on purpose: its sheet is checked by sanitizeStyleSheet() below,
  // because sanitize-html passes style text through untouched.
  allowVulnerableTags: true,
  transformTags: {
    "*": (tagName, attribs) => {
      const out = { ...attribs };
      if (out.style !== undefined) {
        const style = sanitizeInlineCss(out.style);
        if (style) out.style = style;
        else delete out.style;
      }
      if (tagName === "img" && out.src !== undefined && !isAllowedImageSrc(out.src)) delete out.src;
      // Only named metadata (viewport, description…) needs `content`.
      if (tagName === "meta" && !out.name) delete out.content;
      return { tagName, attribs: out };
    },
  },
};

/**
 * Makes user- or AI-written email HTML safe to store, preview and send. Idempotent:
 * sanitizing the output again returns it unchanged.
 */
export function sanitizeEmailHtml(html: string): string {
  const clean = sanitizeHtml(html, SANITIZE_OPTIONS)
    // sanitize-html emits an allowed <style> element's text verbatim and its text can
    // never contain "</style>", so each match is exactly one element.
    .replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi, (_m, open: string, css: string, close: string) => {
      const sheet = sanitizeStyleSheet(css);
      return sheet ? `${open}${sheet}${close}` : "";
    })
    .trim();
  return /^<html[\s>]/i.test(clean) ? `<!DOCTYPE html>\n${clean}` : clean;
}

/**
 * Fills the variables of an HTML template (values HTML-escaped) and sanitizes the
 * result again: a value can put a URL into an href or src, and only now is it known.
 */
export function renderHtmlTemplate(body: string, vars: Record<string, string>): string {
  return sanitizeEmailHtml(interpolate(body, vars, { escape: escapeHtmlValue }));
}

const ESCAPES: Record<string, string> ={ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => ESCAPES[ch]);
}

/** A variable value for an HTML template: escaped, with line breaks kept as <br>. */
export function escapeHtmlValue(value: string): string {
  return escapeHtml(value).replace(/\r\n|\r|\n/g, "<br>");
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  copy: "©", reg: "®", trade: "™", hellip: "…", mdash: "—", ndash: "–", bull: "•", middot: "·",
  lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", laquo: "«", raquo: "»",
  euro: "€", pound: "£", yen: "¥", cent: "¢", deg: "°", times: "×", zwnj: "", zwj: "",
};

export function decodeHtmlEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z][a-z0-9]*);/gi, (match, entity: string) => {
    if (entity[0] === "#") {
      const code = entity[1] === "x" || entity[1] === "X" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
    }
    return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
  });
}

/**
 * Plain-text version of sanitized email HTML, sent as the text/plain alternative:
 * blocks become lines, list items get "- ", links keep their URL in parentheses.
 */
export function htmlToText(html: string): string {
  const text = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(head|style|script|title)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/\s+/g, " ")
    // Still entity-encoded here; everything is decoded once at the end.
    .replace(/<a\b[^>]*?\bhref\s*=\s*"([^"]*)"[^>]*>([\s\S]*?)<\/a\s*>/gi, (_m, rawHref: string, inner: string) => {
      const href = rawHref.trim();
      const label = inner.replace(/<[^>]*>/g, "").trim();
      const target = /^mailto:/i.test(href) ? href.slice(7) : href;
      const sameAsLabel = decodeHtmlEntities(label) === decodeHtmlEntities(target);
      if (!/^(https?:|mailto:)/i.test(href) || sameAsLabel) return label || target;
      return label ? `${label} (${target})` : target;
    })
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "\n- ")
    .replace(/<hr\b[^>]*>/gi, "\n\n")
    .replace(/<\/(p|h[1-6]|blockquote|table|ul|ol|dl|pre)\s*>/gi, "\n\n")
    .replace(/<\/(div|tr|dt|dd|section|article|header|footer|main|center|figure|figcaption|caption|address)\s*>/gi, "\n")
    .replace(/<\/(td|th)\s*>/gi, " ")
    .replace(/<[^>]*>/g, "");

  return decodeHtmlEntities(text)
    .replace(/ /g, " ")
    .split("\n")
    .map((line) => line.replace(/[ \t\f\v]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
