import { describe, it, expect, beforeEach } from "vitest";
import { SettingsService } from "./settings.service.js";
import type {
  ISettingsRepo,
  AppSettings,
  ProfileField,
} from "./settings.repo.js";

/** Stateful in-memory fake repo so encrypt→store→decrypt round-trips realistically. */
function makeFakeRepo(): ISettingsRepo & { app: Partial<AppSettings>; fields: ProfileField[] } {
  const state = {
    app: { id: 1, userId: 1, emailProvider: "gmail", candidateProfile: "{}" } as Partial<AppSettings>,
    fields: [] as ProfileField[],
  };
  return {
    app: state.app,
    get fields() {
      return state.fields;
    },
    async getApp(_userId: number) {
      return state.app as AppSettings;
    },
    async patchApp(_userId: number, patch) {
      Object.assign(state.app, patch);
      return state.app as AppSettings;
    },
    async listProfileFields(_userId: number) {
      return state.fields;
    },
    async replaceProfileFields(userId: number, fields) {
      state.fields = fields.map((f, i) => ({
        ...f, id: i + 1, userId, sortOrder: i, createdAt: new Date(), updatedAt: new Date(),
      }));
      return state.fields;
    },
    async listResumes(_userId: number) {
      return [];
    },
    async getResume(_userId: number, _resumeId: number) {
      return null;
    },
    async addResume(_userId: number, name: string, fileName: string, filePath: string) {
      return { id: 1, userId: _userId, name, fileName, filePath, createdAt: new Date() };
    },
    async deleteResume(_userId: number, _resumeId: number) {
      return null;
    },
  };
}

describe("SettingsService", () => {
  let repo: ReturnType<typeof makeFakeRepo>;
  let service: SettingsService;
  const userId = 1;

  beforeEach(() => {
    repo = makeFakeRepo();
    service = new SettingsService(repo);
  });

  it("encrypts the Gmail app password at rest and round-trips via getGmailCreds", async () => {
    await service.updateGmail(userId, { email: "me@gmail.com", appPassword: "abcd efgh ijkl mnop" });
    expect(repo.app.gmailAppPasswordEnc).toBeDefined();
    expect(repo.app.gmailAppPasswordEnc).not.toContain("abcd efgh ijkl mnop");
    const creds = await service.getGmailCreds(userId);
    expect(creds).toEqual({ email: "me@gmail.com", password: "abcd efgh ijkl mnop" });
  });

  it("encrypts the Gemini key and round-trips via getGeminiKey", async () => {
    await service.updateGemini(userId, { apiKey: "AIzaTopSecretKey" });
    expect(repo.app.geminiApiKeyEnc).toBeDefined();
    expect(repo.app.geminiApiKeyEnc).not.toContain("AIzaTopSecretKey");
    expect(await service.getGeminiKey(userId)).toBe("AIzaTopSecretKey");
  });

  it("getGmailCreds returns null when not configured", async () => {
    expect(await service.getGmailCreds(userId)).toBeNull();
  });

  it("getPublic exposes booleans and candidate but NEVER decrypted secrets", async () => {
    await service.updateGmail(userId, { email: "me@gmail.com", appPassword: "secretpass" });
    await service.updateGemini(userId, { apiKey: "secretkey" });
    const pub = await service.getPublic(userId);
    expect(pub.gmailConfigured).toBe(true);
    expect(pub.geminiConfigured).toBe(true);
    expect(pub.gmailEmail).toBe("me@gmail.com");
    const serialized = JSON.stringify(pub);
    expect(serialized).not.toContain("secretpass");
    expect(serialized).not.toContain("secretkey");
    expect(pub.senderDailyLimit).toBe(100);
    expect(pub.profileFields).toEqual([]);
  });

  it("updateCandidate merges with the existing profile", async () => {
    await service.updateCandidate(userId, { name: "Nikhil", role: "Software Engineer" });
    const merged = await service.updateCandidate(userId, { phone: "12345" });
    expect(merged.name).toBe("Nikhil");
    expect(merged.role).toBe("Software Engineer");
    expect(merged.phone).toBe("12345");
  });

  it("buildSignature includes name, role, phone, email and links", () => {
    const sig = service.buildSignature({
      name: "Nikhil Malviya",
      role: "Software Engineer",
      phone: "999",
      email: "n@example.com",
      linkedin: "https://linkedin.com/in/x",
      github: "https://github.com/x",
      portfolio: "https://x.dev",
    });
    expect(sig).toContain("Regards,");
    expect(sig).toContain("Nikhil Malviya");
    expect(sig).toContain("Software Engineer");
    expect(sig).toContain("Phone: 999");
    expect(sig).toContain("Email: n@example.com");
    expect(sig).toContain("LinkedIn: https://linkedin.com/in/x");
    expect(sig).toContain("GitHub: https://github.com/x");
    expect(sig).toContain("Portfolio: https://x.dev");
  });

  it("updateSending stores the primary Gmail daily cap", async () => {
    await service.updateSending(userId, { senderDailyLimit: 40 });
    expect(await service.getSenderDailyLimit(userId)).toBe(40);
  });

  it("replaceProfileFields stores custom fields and exposes them as template vars", async () => {
    const saved = await service.replaceProfileFields(userId, {
      fields: [
        { key: "company_name", label: "Company", value: "Acme" },
        { key: "offer", label: "Offer", value: "20% off" },
      ],
    });
    expect(saved).toEqual([
      { key: "company_name", label: "Company", value: "Acme" },
      { key: "offer", label: "Offer", value: "20% off" },
    ]);
    expect(await service.getProfileVars(userId)).toEqual({ company_name: "Acme", offer: "20% off" });
  });
});
