/**
 * Suggested starter categories for the Inbox Sorter.
 *
 * These are only a starting point — every field is editable and any category can be
 * deleted, because the right set differs per person. The `priority` ladder is what
 * makes classification predictable (lower number wins):
 *
 *   OTP (5) is first because a mis-bucketed one-time code is the worst possible failure.
 *   Job Applications (10) beats Job Board Notifications (50) so that LinkedIn's
 *   "your application was sent" lands in the tracked pipeline, not the noise bucket.
 */

export type SeedRuleField = "FROM_ADDRESS" | "FROM_DOMAIN" | "SUBJECT" | "BODY" | "ANY_TEXT";
export type SeedMatchType = "CONTAINS" | "EQUALS" | "STARTS_WITH" | "ENDS_WITH" | "REGEX";
export type SeedJobStatus =
  | "APPLIED" | "ACKNOWLEDGED" | "RECRUITER_REPLY" | "INTERVIEW_INVITE"
  | "ASSESSMENT" | "OFFER" | "REJECTION" | "WITHDRAWN" | "OTHER";

export interface SeedRule {
  field: SeedRuleField;
  matchType?: SeedMatchType;
  value: string;
  subStatus?: SeedJobStatus;
}

export interface SeedCategory {
  name: string;
  /** Fed verbatim to the AI classifier — describes the mail, not the label. */
  description: string;
  color: string;
  trackSubStatus: boolean;
  sortOrder: number;
  /** Stamped onto every rule this category seeds. */
  priority: number;
  rules: SeedRule[];
}

const subject = (value: string, subStatus?: SeedJobStatus): SeedRule => ({
  field: "SUBJECT", matchType: "CONTAINS", value, ...(subStatus ? { subStatus } : {}),
});
const domain = (value: string): SeedRule => ({ field: "FROM_DOMAIN", matchType: "EQUALS", value });

export const INBOX_CATEGORY_SEED: SeedCategory[] = [
  {
    name: "OTP",
    description:
      "One-time passcodes, verification codes, two-factor authentication codes and login confirmation codes. Short, time-sensitive, and usually useless after a few minutes.",
    color: "#F59E0B",
    trackSubStatus: false,
    sortOrder: 0,
    priority: 5,
    rules: [
      subject("otp"),
      subject("one-time"),
      subject("verification code"),
      subject("your code is"),
      subject("2fa"),
      subject("security code"),
      subject("login code"),
    ],
  },
  {
    name: "Job Applications & Responses",
    description:
      "Direct correspondence about a specific job application: confirmations that an application was received, recruiter replies, interview invitations, online assessments or coding challenges, offer letters, and rejections. This is a real conversation about one role at one company — not a generic list of job openings.",
    color: "#10B981",
    trackSubStatus: true,
    sortOrder: 1,
    priority: 10,
    rules: [
      subject("application received", "ACKNOWLEDGED"),
      subject("we received your application", "ACKNOWLEDGED"),
      subject("thank you for applying", "APPLIED"),
      subject("application submitted", "APPLIED"),
      subject("your application", "ACKNOWLEDGED"),
      subject("interview", "INTERVIEW_INVITE"),
      subject("schedule a call", "RECRUITER_REPLY"),
      subject("availability for a call", "RECRUITER_REPLY"),
      subject("assessment", "ASSESSMENT"),
      subject("coding challenge", "ASSESSMENT"),
      subject("take-home", "ASSESSMENT"),
      subject("offer letter", "OFFER"),
      subject("we regret", "REJECTION"),
      subject("not moving forward", "REJECTION"),
      subject("unfortunately", "REJECTION"),
    ],
  },
  {
    name: "Bank",
    description:
      "Bank and payment-account activity: debit and credit alerts, transaction notifications, UPI/NEFT/IMPS confirmations, account statements and balance updates.",
    color: "#3B82F6",
    trackSubStatus: false,
    sortOrder: 2,
    priority: 20,
    rules: [
      subject("debited"),
      subject("credited"),
      subject("transaction alert"),
      subject("account statement"),
      subject("upi"),
      subject("neft"),
      subject("imps"),
      subject("available balance"),
    ],
  },
  {
    name: "Bills",
    description:
      "Invoices and amounts owed: utility and phone bills, payment-due reminders, receipts and payment confirmations, due-date notices.",
    color: "#EF4444",
    trackSubStatus: false,
    sortOrder: 3,
    priority: 30,
    rules: [
      subject("invoice"),
      subject("payment due"),
      subject("amount due"),
      // Plain "bill" rather than "your bill": real subjects read "Your Airtel bill
      // is due", so the possessive form misses the common case.
      subject("bill"),
      subject("receipt"),
      subject("due date"),
      subject("payment successful"),
    ],
  },
  {
    name: "Subscriptions",
    description:
      "Recurring paid services: subscription renewals and confirmations, trial-ending warnings, plan changes, and billing notices from streaming, software and SaaS providers.",
    color: "#8B5CF6",
    trackSubStatus: false,
    sortOrder: 4,
    priority: 40,
    rules: [
      subject("subscription"),
      subject("renewal"),
      subject("trial ends"),
      subject("your plan"),
      subject("auto-renew"),
      domain("netflix.com"),
      domain("spotify.com"),
      domain("youtube.com"),
    ],
  },
  {
    name: "Job Board Notifications",
    description:
      "Automated bulk mail from job boards and professional networks: job-alert digests, 'jobs for you' recommendations, recruiter-viewed-your-profile pings and newsletters. Marketing volume, not a reply about a specific application.",
    color: "#6366F1",
    trackSubStatus: false,
    sortOrder: 5,
    priority: 50,
    rules: [
      domain("linkedin.com"),
      domain("naukri.com"),
      domain("indeed.com"),
      domain("glassdoor.com"),
      domain("hirist.com"),
      domain("wellfound.com"),
      domain("ziprecruiter.com"),
      domain("monster.com"),
      subject("jobs for you"),
      subject("new jobs matching"),
      subject("job alert"),
    ],
  },
  {
    name: "Games",
    description:
      "Gaming platforms and titles: store sales and wishlist alerts, free-game giveaways, patch notes, season or battle-pass news, and in-game event announcements.",
    color: "#EC4899",
    trackSubStatus: false,
    sortOrder: 6,
    priority: 60,
    rules: [
      domain("steampowered.com"),
      domain("epicgames.com"),
      domain("riotgames.com"),
      domain("playstation.com"),
      domain("xbox.com"),
      domain("nintendo.com"),
      domain("ea.com"),
    ],
  },
];
