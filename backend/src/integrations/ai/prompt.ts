/**
 * Builds the constrained personalization prompt (the same for every provider).
 *
 * The prompt instructs the model to:
 *  - Personalize ONLY the greeting and opening paragraph, and the subject line.
 *  - Mention the contact's company and location naturally — only when they are known.
 *  - Keep it concise and professional.
 *  - NOT invent facts.
 *  - Return STRICT JSON { "subject": string, "body": string } — nothing else.
 *  - Optionally write in the campaign's language and follow its extra instructions.
 */

export interface PersonalizationPromptInput {
  subject: string;
  body: string;
  /** The contact's company; blank when unknown (contacts are generic, the field is optional). */
  company?: string | null;
  /** The contact's location; blank when unknown. */
  location?: string | null;
  /** The contact's first name; blank when unknown. */
  firstName?: string | null;
  senderName: string;
  /** Language the final email must be in (campaign setting). */
  language?: string;
  /** Free-text guidance from the campaign (tone, offer, audience…). */
  instructions?: string;
}

export function buildPersonalizationPrompt(input: PersonalizationPromptInput): string {
  const { subject, body, senderName } = input;
  const company = input.company?.trim() ?? "";
  const location = input.location?.trim() ?? "";
  const firstName = input.firstName?.trim() ?? "";
  const language = input.language?.trim();
  const instructions = input.instructions?.trim();

  // Only ask the model to mention what we actually know about the contact; asking it to
  // mention an empty company or location invites made-up details.
  const known = [company && `"${company}"`, location && `"${location}"`].filter(Boolean);
  const mentionRule = known.length > 0
    ? `Mention ${known.join(" and ")} naturally in the personalized text.`
    : "The contact's company and location are unknown — do not guess or mention any.";

  const languageRule = language
    ? `\n7. The final subject and body must be written in ${language}. If the original is in another language, translate it faithfully into ${language} (translation does not count as changing the content).`
    : "";
  const instructionsBlock = instructions
    ? `\nADDITIONAL INSTRUCTIONS FROM THE SENDER (follow them unless they conflict with rules 4 or 6):\n${instructions}\n`
    : "";
  const contactLines = [
    firstName && `CONTACT FIRST NAME: ${firstName}`,
    company && `COMPANY: ${company}`,
    location && `LOCATION: ${location}`,
  ].filter(Boolean).map((line) => `${line}\n`).join("");

  return `You are an expert outreach email personalizer.

Your task is to lightly personalize an existing email template for a specific contact.

RULES (must follow exactly):
1. Personalize ONLY the greeting, the opening paragraph, and the email subject line.
2. ${mentionRule}
3. Keep the tone concise and professional.
4. Do NOT invent facts, credentials, or claims not present in the original template.
5. Keep the rest of the email body identical to the original.
6. Return ONLY a strict JSON object with exactly these two fields — no markdown, no code fences, no extra keys:
   { "subject": "<personalized subject>", "body": "<full personalized email body>" }${languageRule}
${instructionsBlock}
SENDER NAME: ${senderName}
${contactLines}
ORIGINAL SUBJECT:
${subject}

ORIGINAL BODY:
${body}

Now return the personalized JSON object:`;
}
