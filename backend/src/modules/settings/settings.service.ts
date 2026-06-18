import * as path from "path";
import { encrypt, decrypt } from "../../utils/crypto.js";
import { logger } from "../../utils/logger.js";
import {
  settingsRepo,
  type ISettingsRepo,
  type CampaignSettings,
} from "./settings.repo.js";
import type {
  UpdateGmailInput,
  UpdateGeminiInput,
  CandidateProfile,
  UpdateCampaignInput,
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
  candidate: CandidateProfile;
  resumeFileName: string | null;
  campaign: {
    mode: string;
    state: string;
    dailyLimit: number;
    startHour: number;
    endHour: number;
    testEmail: string | null;
    enabled: boolean;
  } | null;
}

export class SettingsService {
  constructor(private repo: ISettingsRepo = settingsRepo) {}

  // ---- secret reads (decrypt) ------------------------------------------------

  async getGmailCreds(): Promise<GmailCreds | null> {
    const app = await this.repo.getApp();
    if (!app?.gmailEmail || !app.gmailAppPasswordEnc) return null;
    return { email: app.gmailEmail, password: decrypt(app.gmailAppPasswordEnc) };
  }

  async getGeminiKey(): Promise<string> {
    const app = await this.repo.getApp();
    if (!app?.geminiApiKeyEnc) return "";
    return decrypt(app.geminiApiKeyEnc);
  }

  async getEmailProviderName(): Promise<string> {
    const app = await this.repo.getApp();
    return app?.emailProvider ?? "gmail";
  }

  // ---- candidate profile -----------------------------------------------------

  async getCandidateProfile(): Promise<CandidateProfile> {
    const app = await this.repo.getApp();
    if (!app?.candidateProfile) return {};
    try {
      return JSON.parse(app.candidateProfile) as CandidateProfile;
    } catch {
      logger.warn("candidate profile JSON is corrupt — returning empty profile");
      return {};
    }
  }

  buildSignature(profile: CandidateProfile): string {
    const lines = ["Regards,", ""];
    if (profile.name) lines.push(profile.name);
    if (profile.role) lines.push(profile.role);
    if (profile.phone) lines.push(`Phone: ${profile.phone}`);
    if (profile.email) lines.push(`Email: ${profile.email}`);
    if (profile.linkedin) lines.push(`LinkedIn: ${profile.linkedin}`);
    if (profile.github) lines.push(`GitHub: ${profile.github}`);
    if (profile.portfolio) lines.push(`Portfolio: ${profile.portfolio}`);
    return lines.join("\n");
  }

  async getResumePath(): Promise<string | null> {
    const app = await this.repo.getApp();
    return app?.resumePath ?? null;
  }

  // ---- updates ---------------------------------------------------------------

  async updateGmail(input: UpdateGmailInput): Promise<void> {
    await this.repo.patchApp({
      gmailEmail: input.email,
      gmailAppPasswordEnc: encrypt(input.appPassword),
    });
  }

  async updateGemini(input: UpdateGeminiInput): Promise<void> {
    await this.repo.patchApp({ geminiApiKeyEnc: encrypt(input.apiKey) });
  }

  async updateCandidate(profile: CandidateProfile): Promise<CandidateProfile> {
    const current = await this.getCandidateProfile();
    const merged = { ...current, ...profile };
    await this.repo.patchApp({ candidateProfile: JSON.stringify(merged) });
    return merged;
  }

  async setResumePath(resumePath: string): Promise<void> {
    await this.repo.patchApp({ resumePath });
  }

  async updateCampaign(input: UpdateCampaignInput): Promise<CampaignSettings> {
    const { emailProvider, ...campaignPatch } = input;
    if (emailProvider !== undefined) {
      await this.repo.patchApp({ emailProvider });
    }
    return this.repo.patchCampaign(campaignPatch as Partial<CampaignSettings>);
  }

  // ---- public view -----------------------------------------------------------

  async getPublic(): Promise<PublicSettings> {
    const app = await this.repo.getApp();
    const campaign = await this.repo.getCampaign();
    return {
      emailProvider: app?.emailProvider ?? "gmail",
      gmailEmail: app?.gmailEmail ?? null,
      gmailConfigured: !!(app?.gmailEmail && app.gmailAppPasswordEnc),
      geminiConfigured: !!app?.geminiApiKeyEnc,
      candidate: await this.getCandidateProfile(),
      resumeFileName: app?.resumePath ? path.basename(app.resumePath) : null,
      campaign: campaign
        ? {
            mode: campaign.mode,
            state: campaign.state,
            dailyLimit: campaign.dailyLimit,
            startHour: campaign.startHour,
            endHour: campaign.endHour,
            testEmail: campaign.testEmail,
            enabled: campaign.enabled,
          }
        : null,
    };
  }
}

export const settingsService = new SettingsService();
