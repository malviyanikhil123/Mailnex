import { encrypt, decrypt } from "../../utils/crypto.js";
import { logger } from "../../utils/logger.js";
import { LIMITS } from "../../config/constants.js";
import {
  settingsRepo,
  type ISettingsRepo,
  type ProfileField,
} from "./settings.repo.js";
import type {
  UpdateGmailInput,
  UpdateGeminiInput,
  SenderProfile,
  SenderProfileInput,
  UpdateSendingInput,
  ProfileFieldsInput,
} from "./settings.schema.js";

export interface GmailCreds {
  email: string;
  password: string;
}

/** Public (API-safe) view of settings — never includes decrypted secrets. */
export interface PublicSettings {
  emailProvider: string;
  gmailEmail: string | null;
  gmailConfigured: boolean;
  geminiConfigured: boolean;
  profile: SenderProfile;
  /** Daily cap of the primary Gmail, shared by every campaign sending from it. */
  senderDailyLimit: number;
  profileFields: Pick<ProfileField, "key" | "label" | "value">[];
}

export class SettingsService {
  constructor(private repo: ISettingsRepo = settingsRepo) {}

  // ---- secret reads (decrypt) ------------------------------------------------

  async getGmailCreds(userId: number): Promise<GmailCreds | null> {
    const app = await this.repo.getApp(userId);
    if (!app?.gmailEmail || !app.gmailAppPasswordEnc) return null;
    return { email: app.gmailEmail, password: decrypt(app.gmailAppPasswordEnc) };
  }

  async getGeminiKey(userId: number): Promise<string> {
    const app = await this.repo.getApp(userId);
    if (!app?.geminiApiKeyEnc) return "";
    return decrypt(app.geminiApiKeyEnc);
  }

  async getEmailProviderName(userId: number): Promise<string> {
    const app = await this.repo.getApp(userId);
    return app?.emailProvider ?? "gmail";
  }

  // ---- sender profile ("My Profile") -----------------------------------------

  async getSenderProfile(userId: number): Promise<SenderProfile> {
    const app = await this.repo.getApp(userId);
    if (!app?.candidateProfile) return {};
    try {
      const profile = JSON.parse(app.candidateProfile) as SenderProfile | null;
      if (!profile || typeof profile !== "object") return {};
      // Job-seeker profiles kept their site under "portfolio"; offer it as the website
      // until the user saves one (an explicitly emptied website stays empty).
      if (profile.website === undefined && profile.portfolio) profile.website = profile.portfolio;
      return profile;
    } catch {
      logger.warn({ userId }, "sender profile JSON is corrupt — returning empty profile");
      return {};
    }
  }

  /** The user's own signature, or a default built from name, company, phone and website. */
  buildSignature(profile: SenderProfile): string {
    const custom = profile.signature?.trim();
    if (custom) return custom;
    const lines = ["Best regards,"];
    for (const value of [profile.name, profile.company, profile.phone, profile.website]) {
      if (value?.trim()) lines.push(value.trim());
    }
    return lines.join("\n");
  }

  // ---- custom profile fields -------------------------------------------------

  async getProfileFields(userId: number): Promise<Pick<ProfileField, "key" | "label" | "value">[]> {
    const rows = await this.repo.listProfileFields(userId);
    return rows.map(({ key, label, value }) => ({ key, label, value }));
  }

  /** Custom fields as template variables: {{key}} → value. */
  async getProfileVars(userId: number): Promise<Record<string, string>> {
    const rows = await this.repo.listProfileFields(userId);
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  }

  async replaceProfileFields(userId: number, input: ProfileFieldsInput) {
    await this.repo.replaceProfileFields(userId, input.fields);
    return this.getProfileFields(userId);
  }

  async getSenderDailyLimit(userId: number): Promise<number> {
    const app = await this.repo.getApp(userId);
    return app?.senderDailyLimit ?? LIMITS.PRIMARY_SENDER_DAILY;
  }

  // ---- updates ---------------------------------------------------------------

  async updateGmail(userId: number, input: UpdateGmailInput): Promise<void> {
    await this.repo.patchApp(userId, {
      gmailEmail: input.email,
      gmailAppPasswordEnc: encrypt(input.appPassword),
    });
  }

  async updateGemini(userId: number, input: UpdateGeminiInput): Promise<void> {
    await this.repo.patchApp(userId, { geminiApiKeyEnc: encrypt(input.apiKey) });
  }

  /** Merges the submitted fields into the stored profile; legacy keys are kept as they are. */
  async updateProfile(userId: number, input: SenderProfileInput): Promise<SenderProfile> {
    const current = await this.getSenderProfile(userId);
    const merged = { ...current, ...input };
    await this.repo.patchApp(userId, { candidateProfile: JSON.stringify(merged) });
    return merged;
  }

  async updateSending(userId: number, input: UpdateSendingInput): Promise<void> {
    await this.repo.patchApp(userId, { senderDailyLimit: input.senderDailyLimit });
  }

  // ---- public view -----------------------------------------------------------

  async getPublic(userId: number): Promise<PublicSettings> {
    const app = await this.repo.getApp(userId);
    return {
      emailProvider: app?.emailProvider ?? "gmail",
      gmailEmail: app?.gmailEmail ?? null,
      gmailConfigured: !!(app?.gmailEmail && app.gmailAppPasswordEnc),
      geminiConfigured: !!app?.geminiApiKeyEnc,
      profile: await this.getSenderProfile(userId),
      senderDailyLimit: app?.senderDailyLimit ?? LIMITS.PRIMARY_SENDER_DAILY,
      profileFields: await this.getProfileFields(userId),
    };
  }
}

export const settingsService = new SettingsService();
