import type { EmailCategory } from "./lead-discovery.types.js";

export interface ClassificationResult {
  category: EmailCategory;
  confidence: number;
}

const HR_PATTERNS = [
  /^hr@/i,
  /^careers?@/i,
  /^jobs?@/i,
  /^recruitment@/i,
  /^recruiting@/i,
  /^talent@/i,
  /^talentacquisition@/i,
  /^hiring@/i,
  /^people@/i,
  /^join@/i,
  /^work@/i,
  /^opportunities@/i,
  /^resume@/i,
  /^cv@/i,
];

const IT_PATTERNS = [
  /^it@/i,
  /^tech@/i,
  /^technology@/i,
  /^dev@/i,
  /^developer@/i,
  /^engineering@/i,
  /^devops@/i,
  /^security@/i,
  /^support@/i,
  /^helpdesk@/i,
  /^admin@/i,
  /^sysadmin@/i,
];

const ACCOUNTS_FINANCE_PATTERNS = [
  /^accounts?@/i,
  /^finance@/i,
  /^billing@/i,
  /^invoice@/i,
  /^invoicing@/i,
  /^accounting@/i,
  /^payments?@/i,
  /^ap@/i,
  /^ar@/i,
];

const SALES_MARKETING_PATTERNS = [
  /^sales@/i,
  /^marketing@/i,
  /^growth@/i,
  /^business@/i,
  /^partnerships?@/i,
  /^press@/i,
  /^media@/i,
  /^bd@/i,
  /^leads?@/i,
];

const GENERAL_PATTERNS = [
  /^info@/i,
  /^contact@/i,
  /^hello@/i,
  /^office@/i,
  /^mail@/i,
  /^enquiries?@/i,
  /^inquiry@/i,
  /^frontdesk@/i,
  /^general@/i,
];

export function classifyEmail(
  email: string,
  context?: { url?: string; pageTitle?: string; contextSnippet?: string }
): ClassificationResult {
  const normalized = email.toLowerCase().trim();
  const url = (context?.url || "").toLowerCase();
  const title = (context?.pageTitle || "").toLowerCase();
  const snippet = (context?.contextSnippet || "").toLowerCase();

  // 1. Direct prefix match for HR & Recruitment
  for (const pattern of HR_PATTERNS) {
    if (pattern.test(normalized)) {
      if (/^hr@/i.test(normalized)) return { category: "HR", confidence: 0.98 };
      if (/^recruitment@|^recruiting@/i.test(normalized)) return { category: "Recruitment", confidence: 0.98 };
      if (/^careers?@|^jobs?@/i.test(normalized)) return { category: "Careers", confidence: 0.98 };
      return { category: "HR", confidence: 0.95 };
    }
  }

  // 2. Direct prefix match for IT
  for (const pattern of IT_PATTERNS) {
    if (pattern.test(normalized)) {
      return { category: "IT", confidence: 0.95 };
    }
  }

  // 3. Direct prefix match for Accounts & Finance
  for (const pattern of ACCOUNTS_FINANCE_PATTERNS) {
    if (pattern.test(normalized)) {
      if (/^finance@/i.test(normalized)) return { category: "Finance", confidence: 0.95 };
      return { category: "Accounts", confidence: 0.95 };
    }
  }

  // 4. Direct prefix match for Sales & Marketing
  for (const pattern of SALES_MARKETING_PATTERNS) {
    if (pattern.test(normalized)) {
      return { category: "Sales", confidence: 0.95 };
    }
  }

  // 5. Check URL / page context for Career/Job/HR pages
  const isCareersPage =
    url.includes("/career") ||
    url.includes("/jobs") ||
    url.includes("/recruitment") ||
    url.includes("/talent") ||
    url.includes("/work-with-us") ||
    url.includes("/join-us") ||
    title.includes("career") ||
    title.includes("jobs") ||
    title.includes("hiring");

  if (isCareersPage) {
    return { category: "Careers", confidence: 0.85 };
  }

  // 6. Direct prefix match for General
  for (const pattern of GENERAL_PATTERNS) {
    if (pattern.test(normalized)) {
      return { category: "General", confidence: 0.90 };
    }
  }

  // 7. Check snippet context for keywords
  if (snippet.includes("career") || snippet.includes("job") || snippet.includes("hiring") || snippet.includes("resume")) {
    return { category: "HR", confidence: 0.75 };
  }

  if (snippet.includes("developer") || snippet.includes("engineer") || snippet.includes("technology")) {
    return { category: "IT", confidence: 0.70 };
  }

  if (snippet.includes("account") || snippet.includes("billing") || snippet.includes("finance")) {
    return { category: "Finance", confidence: 0.70 };
  }

  // 8. Default fallback
  return { category: "Other", confidence: 0.50 };
}
