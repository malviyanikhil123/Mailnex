/**
 * Deterministic rule matcher — pure, no DB, no I/O.
 *
 * The contract the UI promises the user is "read your rules top to bottom and the
 * first one that matches wins". That only holds if ordering lives here rather than
 * depending on the order rows happen to come back from Postgres, so matchRules
 * sorts its own input and short-circuits on the first hit.
 *
 * Deliberately NOT a scoring or voting system: a user who cannot predict the
 * outcome from reading the list will not trust the feature.
 */

import { logger } from "../../utils/logger.js";
import { normalizeForMatch } from "../../utils/normalize-text.js";

export type RuleField = "FROM_ADDRESS" | "FROM_DOMAIN" | "SUBJECT" | "BODY" | "ANY_TEXT";
export type MatchType = "CONTAINS" | "EQUALS" | "STARTS_WITH" | "ENDS_WITH" | "REGEX";
export type JobStatus =
  | "APPLIED" | "ACKNOWLEDGED" | "RECRUITER_REPLY" | "INTERVIEW_INVITE"
  | "ASSESSMENT" | "OFFER" | "REJECTION" | "WITHDRAWN" | "OTHER";

export interface RuleLike {
  id: number;
  categoryId: number;
  field: RuleField;
  matchType: MatchType;
  /** Already normalizeForMatch()-ed at write time. */
  valueNormalized: string;
  priority: number;
  enabled: boolean;
  subStatus: JobStatus | null;
}

export interface ClassifiableMessage {
  fromAddress: string;
  fromDomain: string;
  subject: string;
  bodyText: string;
}

export interface RuleMatch {
  categoryId: number;
  ruleId: number;
  subStatus: JobStatus | null;
}

/**
 * At equal priority a precise sender beats a loose body keyword, so a user who
 * leaves every rule at the default priority still gets sensible behavior.
 */
const SPECIFICITY_RANK: Record<RuleField, number> = {
  FROM_ADDRESS: 0,
  FROM_DOMAIN: 1,
  SUBJECT: 2,
  BODY: 3,
  ANY_TEXT: 4,
};

function haystackFor(field: RuleField, msg: ClassifiableMessage): string {
  switch (field) {
    case "FROM_ADDRESS": return normalizeForMatch(msg.fromAddress);
    case "FROM_DOMAIN": return normalizeForMatch(msg.fromDomain);
    case "SUBJECT": return normalizeForMatch(msg.subject);
    case "BODY": return normalizeForMatch(msg.bodyText);
    case "ANY_TEXT":
      return normalizeForMatch(`${msg.subject}\n${msg.bodyText}\n${msg.fromAddress}`);
  }
}

function matchesOne(rule: RuleLike, msg: ClassifiableMessage): boolean {
  const value = rule.valueNormalized;
  if (!value) return false;
  const hay = haystackFor(rule.field, msg);
  if (!hay) return false;

  switch (rule.matchType) {
    case "CONTAINS":
      return hay.includes(value);
    case "EQUALS":
      // A FROM_DOMAIN rule for "chase.com" should also catch "email.chase.com",
      // otherwise every sending subdomain needs its own rule.
      if (rule.field === "FROM_DOMAIN") {
        return hay === value || hay.endsWith(`.${value}`);
      }
      return hay === value;
    case "STARTS_WITH":
      return hay.startsWith(value);
    case "ENDS_WITH":
      return hay.endsWith(value);
    case "REGEX": {
      // User-supplied patterns are a ReDoS vector. Contained by: compiling inside
      // try/catch, allowing only the "i" flag, and matching against text the
      // ingest layer already capped at INBOX.MAX_TEXT_CHARS.
      try {
        return new RegExp(value, "i").test(hay);
      } catch {
        logger.warn({ ruleId: rule.id, pattern: value }, "inbox rule has an invalid regex — skipping it");
        return false;
      }
    }
  }
}

/**
 * Returns the first matching rule, or null when nothing matches (the caller then
 * hands the message to the AI pass). Never throws.
 */
export function matchRules(msg: ClassifiableMessage, rules: RuleLike[]): RuleMatch | null {
  const ordered = rules
    .filter((r) => r.enabled)
    .sort((a, b) =>
      a.priority - b.priority ||
      SPECIFICITY_RANK[a.field] - SPECIFICITY_RANK[b.field] ||
      a.id - b.id,
    );

  for (const rule of ordered) {
    if (matchesOne(rule, msg)) {
      return { categoryId: rule.categoryId, ruleId: rule.id, subStatus: rule.subStatus };
    }
  }
  return null;
}
