import { isValidEmail } from "../../utils/email-validator.js";

export interface ExtractedEmail {
  email: string;
  normalizedEmail: string;
  sourceUrl?: string;
  contextSnippet?: string;
}

// Ignore list for common static assets, analytics, vendors, and placeholder domains
const INVALID_EMAIL_PATTERNS = [
  /\.(png|jpg|jpeg|gif|svg|webp|css|js|woff|woff2|ttf|eot|ico|pdf|zip)$/i,
  /@(example\.com|domain\.com|yourcompany\.com|email\.com|mysite\.com|test\.com|sample\.com)$/i,
  /@(sentry\.io|wixpress\.com|wordpress\.org|schema\.org|cloudflare\.com|gravatar\.com|googleapis\.com)$/i,
  /@(2x|3x|1x)\./i,
  /^(user|name|username|test|dummy|demo)@/i,
  /^[0-9]+@/, // purely numeric usernames often tracking IDs
];

export function extractEmailsFromHtml(html: string, sourceUrl?: string): ExtractedEmail[] {
  if (!html || typeof html !== "string") return [];

  const foundMap = new Map<string, ExtractedEmail>();

  // 1. Extract from mailto: links
  const mailtoRegex = /href=["']mailto:([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})[^"']*["']/gi;
  let match: RegExpExecArray | null;
  while ((match = mailtoRegex.exec(html)) !== null) {
    const raw = match[1];
    processCandidate(raw, sourceUrl, "mailto link", foundMap);
  }

  // 2. Extract from raw text / attributes using broad email regex
  const generalEmailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
  while ((match = generalEmailRegex.exec(html)) !== null) {
    const raw = match[0];
    const index = match.index;
    const start = Math.max(0, index - 40);
    const end = Math.min(html.length, index + raw.length + 40);
    const snippet = html.slice(start, end).replace(/\s+/g, " ").trim();
    processCandidate(raw, sourceUrl, snippet, foundMap);
  }

  return Array.from(foundMap.values());
}

function processCandidate(
  rawEmail: string,
  sourceUrl: string | undefined,
  contextSnippet: string,
  outMap: Map<string, ExtractedEmail>
) {
  const cleaned = rawEmail.trim().replace(/^['"<]+|['">]+$/g, "");
  const normalized = cleaned.toLowerCase();

  // Basic validation check
  if (!isValidEmail(normalized)) return;

  // Filter out invalid patterns and file extensions
  for (const pattern of INVALID_EMAIL_PATTERNS) {
    if (pattern.test(normalized)) return;
  }

  // Domain TLD length check
  const parts = normalized.split("@");
  if (parts.length !== 2) return;
  const domainParts = parts[1].split(".");
  if (domainParts.length < 2 || domainParts.some((p) => p.length === 0)) return;

  if (!outMap.has(normalized)) {
    outMap.set(normalized, {
      email: cleaned,
      normalizedEmail: normalized,
      sourceUrl,
      contextSnippet,
    });
  }
}

export function extractPageTitle(html: string): string {
  const match = /<title[^>]*>([^<]+)<\/title>/i.exec(html);
  return match ? match[1].trim() : "";
}
