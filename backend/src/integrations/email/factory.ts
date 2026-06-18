/**
 * getEmailProvider — returns the correct EmailProvider implementation
 * given a settings object.
 *
 * Currently supported:
 *   - "gmail": constructs a GmailProvider with the supplied gmail credentials.
 *
 * Future providers (Outlook, SendGrid, SES) will be added here when ready.
 * Throws an error for any unrecognised provider name so callers fail fast.
 *
 * @example
 * const provider = getEmailProvider({ provider: "gmail", gmail: { user, pass } });
 */

import { GmailProvider } from "./gmail-provider.js";
import type { EmailProvider } from "./provider.js";

export interface GmailSettings {
  user: string;
  pass: string;
}

export interface ProviderSettings {
  provider: string;
  gmail?: GmailSettings;
}

export function getEmailProvider(settings: ProviderSettings): EmailProvider {
  switch (settings.provider) {
    case "gmail": {
      const creds = settings.gmail;
      if (!creds) {
        throw new Error(
          "getEmailProvider: gmail settings (user/pass) are required for provider 'gmail'",
        );
      }
      return new GmailProvider(creds);
    }
    default:
      throw new Error(`Unsupported email provider: ${settings.provider}`);
  }
}
