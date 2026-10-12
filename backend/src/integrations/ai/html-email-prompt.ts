/**
 * Prompt for "Generate with AI" on HTML templates, and the clean-up of the model's
 * answer. The model is asked for one self-contained, email-client-safe HTML document;
 * whatever it returns is still sanitized by the caller before the user sees it.
 */

export interface HtmlEmailPromptInput {
  description: string;
  tone?: string;
  brandColor?: string;
  /** Use the documented {{variables}} in the copy (default) or write generic copy. */
  includeVariables: boolean;
}

/** The variables the model may use, with what they hold. */
const PROMPT_VARIABLES: [string, string][] = [
  ["{{first_name|there}}", 'recipient first name, falls back to "there"'],
  ["{{full_name}}", "recipient full name"],
  ["{{company}}", "recipient's company"],
  ["{{location}}", "recipient's city or region"],
  ["{{my_name}}", "sender's name"],
  ["{{my_company}}", "sender's company"],
  ["{{my_email}}", "sender's email address"],
  ["{{my_phone}}", "sender's phone number"],
  ["{{my_website}}", "sender's website URL (only inside href, never as visible text)"],
  ["{{signature}}", "sender's multi-line sign-off; put it in its own <p> or <td> near the end"],
];

const SYSTEM_RULES = `You are an expert email designer. You write HTML emails that render correctly in Gmail, Outlook, Apple Mail and on phones.

Reply with ONE complete HTML document and nothing else: no explanation, no markdown, no code fences.

Rules:
1. Start with <!DOCTYPE html> and include <html>, <head> (with <meta charset="utf-8"> and a viewport meta tag) and <body>.
2. Put a short, plain subject line for this email (at most 80 characters, no emojis, no ALL CAPS) in the <title> element.
3. Lay out the email with tables (role="presentation", cellpadding="0", cellspacing="0", border="0"): a full-width outer table with a centered inner container of width="600" and style="width:100%;max-width:600px", so it works on desktop and phones.
4. Style everything with inline style attributes. A single <style> block in <head> may only hold @media rules for small screens. Never use @import, <link>, external stylesheets or web fonts — use web-safe font stacks (Arial, Helvetica, Georgia, Verdana…) and hex colors.
5. No JavaScript of any kind, no event handler attributes (onclick…), no <script>, <iframe>, <form>, <input>, <button>, <video>, <audio>, <svg>, <object> or <embed>.
6. Buttons are styled <a> elements (padding, background color, border-radius, no underline). Links use https:// or mailto: URLs only.
7. Images must use https:// URLs and have alt text and a width. Do not invent image URLs: if you do not know a real image URL, design without images (a colored header band with text works well).
8. Keep the copy concise, warm and professional. Avoid spam-trigger wording (free!!!, act now, guaranteed, $$$, excessive exclamation marks) and avoid image-only content.
9. Keep the whole document under 40 KB.`;

export function buildHtmlEmailPrompt(input: HtmlEmailPromptInput): { system: string; prompt: string } {
  const variables = input.includeVariables
    ? `\n10. Personalize with these placeholders, written exactly as shown (double curly braces), where they fit naturally:\n${PROMPT_VARIABLES.map(([v, what]) => `   - ${v}: ${what}`).join("\n")}\n   Do not invent other placeholders.`
    : "\n10. Do not use any {{placeholders}}: write generic copy the sender will edit.";

  const tone = input.tone?.trim() || "professional and friendly";
  const color = input.brandColor?.trim()
    ? `Brand color: ${input.brandColor.trim()} — use it for the header, buttons and links, with enough contrast for readable text.`
    : "Brand color: none given — pick a calm palette with one accent color and enough contrast for readable text.";

  const prompt = `Design an email based on this description:
"""
${input.description.trim()}
"""

Tone: ${tone}.
${color}`;

  return { system: `${SYSTEM_RULES}${variables}`, prompt };
}

/**
 * The HTML document inside a model answer: drops markdown code fences and any chatter
 * before the doctype / <html> or after </html>. Returns "" when there is no markup.
 */
export function extractHtmlDocument(raw: string): string {
  let s = raw.trim();
  const fenced = s.match(/```[a-zA-Z]*[^\S\n]*\n?([\s\S]*?)```/);
  if (fenced) s = fenced[1].trim();
  else s = s.replace(/^```[a-zA-Z]*\s*/, ""); // an answer cut off before its closing fence

  const start = s.search(/<!doctype\s+html|<html[\s>]/i);
  if (start > 0) s = s.slice(start);
  const end = s.toLowerCase().lastIndexOf("</html>");
  if (end !== -1) s = s.slice(0, end + "</html>".length);

  s = s.trim();
  return /<[a-z!]/i.test(s) ? s : "";
}
