/**
 * getMailReader — returns the MailReader implementation for a provider.
 *
 * A structural mirror of integrations/email/factory.ts: switch on the provider name,
 * fail fast on missing credentials, throw for anything unsupported. Kept separate
 * from that factory because reading and sending are different protocols with
 * different lifecycles.
 */

import { ImapFlowMailReader, type GmailImapCredentials } from "./imapflow-reader.js";
import type { MailReader } from "./mail-reader.js";

export interface MailReaderSettings {
  provider: string;
  gmail?: GmailImapCredentials;
}

/** Tagged so classifyImapError can recognise it without string matching. */
function notConfigured(message: string): Error {
  return Object.assign(new Error(message), { imapCode: "NOT_CONFIGURED" });
}

export function getMailReader(settings: MailReaderSettings): MailReader {
  switch (settings.provider) {
    case "gmail": {
      const creds = settings.gmail;
      if (!creds?.user || !creds?.pass) {
        throw notConfigured(
          "getMailReader: gmail credentials (user/pass) are required for provider 'gmail'",
        );
      }
      return new ImapFlowMailReader(creds);
    }
    default:
      throw new Error(`Unsupported inbox provider: ${settings.provider}`);
  }
}
