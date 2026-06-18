/**
 * Builds the constrained personalization prompt for the Gemini model.
 *
 * The prompt instructs the model to:
 *  - Personalize ONLY the greeting and opening paragraph, and the subject line.
 *  - Mention the company and location naturally.
 *  - Keep it concise and professional.
 *  - NOT invent facts.
 *  - Return STRICT JSON { "subject": string, "body": string } — nothing else.
 */

export interface PersonalizationPromptInput {
  subject: string;
  body: string;
  company: string;
  location: string;
  candidateName: string;
}

export function buildPersonalizationPrompt(input: PersonalizationPromptInput): string {
  const { subject, body, company, location, candidateName } = input;

  return `You are an expert job-application email personalizer.

Your task is to lightly personalize an existing email template for a specific company and location.

RULES (must follow exactly):
1. Personalize ONLY the greeting, the opening paragraph, and the email subject line.
2. Mention "${company}" and "${location}" naturally in the personalized text.
3. Keep the tone concise and professional.
4. Do NOT invent facts, credentials, or claims not present in the original template.
5. Keep the rest of the email body identical to the original.
6. Return ONLY a strict JSON object with exactly these two fields — no markdown, no code fences, no extra keys:
   { "subject": "<personalized subject>", "body": "<full personalized email body>" }

CANDIDATE NAME: ${candidateName}
COMPANY: ${company}
LOCATION: ${location}

ORIGINAL SUBJECT:
${subject}

ORIGINAL BODY:
${body}

Now return the personalized JSON object:`;
}
