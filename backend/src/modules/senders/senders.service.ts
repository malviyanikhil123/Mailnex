import { encrypt, decrypt } from "../../utils/crypto.js";
import { getEmailProvider } from "../../integrations/email/factory.js";
import { settingsService } from "../settings/settings.service.js";
import { sendersRepo, type SendersRepo, type SenderAccount } from "./senders.repo.js";
import type { CreateSenderInput, UpdateSenderInput } from "./senders.schema.js";

/** API-safe view of a sender — never includes the app password, encrypted or not. */
export interface PublicSender {
  id: number;
  label: string;
  email: string;
  dailyLimit: number;
  active: boolean;
  createdAt: Date;
}

/** Resolved credentials + daily cap for whichever account a campaign sends from. */
export interface SenderCreds {
  email: string;
  password: string;
  dailyLimit: number;
}

/** Checks Gmail accepts the credentials; rejects with the SMTP error otherwise. */
export type VerifyCreds = (email: string, password: string) => Promise<void>;

const smtpVerify: VerifyCreds = (email, password) =>
  getEmailProvider({ provider: "gmail", gmail: { user: email, pass: password } }).verify();

function httpError(statusCode: number, message: string): Error & { statusCode: number } {
  const err = new Error(message) as Error & { statusCode: number };
  err.statusCode = statusCode;
  return err;
}

function toPublic(s: SenderAccount): PublicSender {
  return { id: s.id, label: s.label, email: s.email, dailyLimit: s.dailyLimit, active: s.active, createdAt: s.createdAt };
}

export class SendersService {
  constructor(
    private repo: SendersRepo = sendersRepo,
    private verify: VerifyCreds = smtpVerify,
  ) {}

  async list(userId: number): Promise<PublicSender[]> {
    return (await this.repo.list(userId)).map(toPublic);
  }

  /** Verifies the app password against Gmail before anything is stored. */
  async create(userId: number, input: CreateSenderInput): Promise<PublicSender> {
    await this.verifyOrThrow(input.email, input.appPassword);
    try {
      const row = await this.repo.create(userId, {
        label: input.label,
        email: input.email,
        appPasswordEnc: encrypt(input.appPassword),
        dailyLimit: input.dailyLimit,
      });
      return toPublic(row);
    } catch (err) {
      if ((err as { code?: string }).code === "23505") throw httpError(409, `${input.email} is already added`);
      throw err;
    }
  }

  async update(userId: number, id: number, input: UpdateSenderInput): Promise<PublicSender> {
    const existing = await this.repo.get(userId, id);
    if (!existing) throw httpError(404, `Sender ${id} not found`);
    const { appPassword, ...rest } = input;
    const patch: Partial<SenderAccount> = { ...rest };
    if (appPassword) {
      await this.verifyOrThrow(existing.email, appPassword);
      patch.appPasswordEnc = encrypt(appPassword);
    }
    const row = await this.repo.update(userId, id, patch);
    if (!row) throw httpError(404, `Sender ${id} not found`);
    return toPublic(row);
  }

  async remove(userId: number, id: number): Promise<void> {
    if (!(await this.repo.remove(userId, id))) throw httpError(404, `Sender ${id} not found`);
  }

  /** Decrypted credentials for sending. senderAccountId null = the primary Gmail from
   *  Settings. Returns null when the account is missing, inactive or not configured. */
  async getCreds(userId: number, senderAccountId: number | null): Promise<SenderCreds | null> {
    if (senderAccountId == null) {
      const creds = await settingsService.getGmailCreds(userId);
      if (!creds) return null;
      return { ...creds, dailyLimit: await settingsService.getSenderDailyLimit(userId) };
    }
    const row = await this.repo.get(userId, senderAccountId);
    if (!row || !row.active) return null;
    return { email: row.email, password: decrypt(row.appPasswordEnc), dailyLimit: row.dailyLimit };
  }

  private async verifyOrThrow(email: string, password: string): Promise<void> {
    try {
      await this.verify(email, password);
    } catch {
      throw httpError(400, "Gmail rejected these credentials — check the address and the 16-character app password");
    }
  }
}

export const sendersService = new SendersService();
