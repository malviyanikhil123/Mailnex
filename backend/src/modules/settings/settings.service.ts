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

  // ---- candidate profile -----------------------------------------------------

  async getCandidateProfile(userId: number): Promise<CandidateProfile> {
    const app = await this.repo.getApp(userId);
    if (!app?.candidateProfile) return {};
    try {
      return JSON.parse(app.candidateProfile) as CandidateProfile;
    } catch {
      logger.warn({ userId }, "candidate profile JSON is corrupt — returning empty profile");
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

  async getResumePath(userId: number): Promise<string | null> {
    const app = await this.repo.getApp(userId);
    return app?.resumePath ?? null;
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

  async updateCandidate(userId: number, profile: CandidateProfile): Promise<CandidateProfile> {
    const current = await this.getCandidateProfile(userId);
    const merged = { ...current, ...profile };
    await this.repo.patchApp(userId, { candidateProfile: JSON.stringify(merged) });
    return merged;
  }

  async setResumePath(userId: number, resumePath: string): Promise<void> {
    await this.repo.patchApp(userId, { resumePath });
  }

  async updateCampaign(userId: number, input: UpdateCampaignInput): Promise<CampaignSettings> {
    const { emailProvider, ...campaignPatch } = input;
    if (emailProvider !== undefined) {
      await this.repo.patchApp(userId, { emailProvider });
    }
    if (campaignPatch.testEmail === "") {
      (campaignPatch as any).testEmail = null;
    }
    return this.repo.patchCampaign(userId, campaignPatch as Partial<CampaignSettings>);
  }

  async listResumes(userId: number) {
    return this.repo.listResumes(userId);
  }

  async getResumeAttachment(
    userId: number,
    resumeId?: number | null,
  ): Promise<{ filename: string; path: string } | null> {
    if (resumeId) {
      const resume = await this.repo.getResume(userId, resumeId);
      if (resume) {
        return { filename: resume.fileName, path: resume.filePath };
      }
    }
    const app = await this.repo.getApp(userId);
    if (app?.resumePath) {
      return { filename: path.basename(app.resumePath), path: app.resumePath };
    }
    return null;
  }

  async addResume(userId: number, name: string, fileName: string, filePath: string) {
    return this.repo.addResume(userId, name, fileName, filePath);
  }

  async deleteResume(userId: number, resumeId: number) {
    return this.repo.deleteResume(userId, resumeId);
  }

  // ---- public view -----------------------------------------------------------

  async getPublic(userId: number): Promise<PublicSettings> {
    const app = await this.repo.getApp(userId);
    const campaign = await this.repo.getCampaign(userId);
    return {
      emailProvider: app?.emailProvider ?? "gmail",
      gmailEmail: app?.gmailEmail ?? null,
      gmailConfigured: !!(app?.gmailEmail && app.gmailAppPasswordEnc),
      geminiConfigured: !!app?.geminiApiKeyEnc,
      candidate: await this.getCandidateProfile(userId),
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
