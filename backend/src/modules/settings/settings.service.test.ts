import { describe, it, expect, beforeEach } from "vitest";
import { SettingsService } from "./settings.service.js";
import type {
  ISettingsRepo,
  AppSettings,
  CampaignSettings,
} from "./settings.repo.js";

/** Stateful in-memory fake repo so encrypt→store→decrypt round-trips realistically. */
function makeFakeRepo(): ISettingsRepo & { app: Partial<AppSettings>; campaign: Partial<CampaignSettings> } {
  const state = {
    app: { id: 1, emailProvider: "gmail", candidateProfile: "{}" } as Partial<AppSettings>,
    campaign: {
      id: 1,
      mode: "DRAFT",
      state: "IDLE",
      dailyLimit: 50,
      startHour: 9,
      endHour: 18,
      testEmail: null,
      enabled: false,
    } as Partial<CampaignSettings>,
  };
  return {
    app: state.app,
    campaign: state.campaign,
    async getApp() {
      return state.app as AppSettings;
    },
    async patchApp(patch) {
      Object.assign(state.app, patch);
      return state.app as AppSettings;
    },
    async getCampaign() {
      return state.campaign as CampaignSettings;
    },
    async patchCampaign(patch) {
      Object.assign(state.campaign, patch);
      return state.campaign as CampaignSettings;
    },
  };
}

describe("SettingsService", () => {
  let repo: ReturnType<typeof makeFakeRepo>;
  let service: SettingsService;

  beforeEach(() => {
    repo = makeFakeRepo();
    service = new SettingsService(repo);
  });

  it("encrypts the Gmail app password at rest and round-trips via getGmailCreds", async () => {
    await service.updateGmail({ email: "me@gmail.com", appPassword: "abcd efgh ijkl mnop" });
    // stored value must be ciphertext, not the plaintext password
    expect(repo.app.gmailAppPasswordEnc).toBeDefined();
    expect(repo.app.gmailAppPasswordEnc).not.toContain("abcd efgh ijkl mnop");
    const creds = await service.getGmailCreds();
    expect(creds).toEqual({ email: "me@gmail.com", password: "abcd efgh ijkl mnop" });
  });

  it("encrypts the Gemini key and round-trips via getGeminiKey", async () => {
    await service.updateGemini({ apiKey: "AIzaTopSecretKey" });
    expect(repo.app.geminiApiKeyEnc).toBeDefined();
    expect(repo.app.geminiApiKeyEnc).not.toContain("AIzaTopSecretKey");
    expect(await service.getGeminiKey()).toBe("AIzaTopSecretKey");
  });

  it("getGmailCreds returns null when not configured", async () => {
    expect(await service.getGmailCreds()).toBeNull();
  });

  it("getPublic exposes booleans and candidate but NEVER decrypted secrets", async () => {
    await service.updateGmail({ email: "me@gmail.com", appPassword: "secretpass" });
    await service.updateGemini({ apiKey: "secretkey" });
    const pub = await service.getPublic();
    expect(pub.gmailConfigured).toBe(true);
    expect(pub.geminiConfigured).toBe(true);
    expect(pub.gmailEmail).toBe("me@gmail.com");
    const serialized = JSON.stringify(pub);
    expect(serialized).not.toContain("secretpass");
    expect(serialized).not.toContain("secretkey");
    expect(pub.campaign?.mode).toBe("DRAFT");
  });

  it("updateCandidate merges with the existing profile", async () => {
    await service.updateCandidate({ name: "Nikhil", role: "Software Engineer" });
    const merged = await service.updateCandidate({ phone: "12345" });
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

  it("updateCampaign updates campaign row and routes emailProvider to app settings", async () => {
    const updated = await service.updateCampaign({
      mode: "TEST",
      dailyLimit: 25,
      testEmail: "test@example.com",
      emailProvider: "gmail",
    });
    expect(updated.mode).toBe("TEST");
    expect(updated.dailyLimit).toBe(25);
    expect(updated.testEmail).toBe("test@example.com");
    expect(repo.app.emailProvider).toBe("gmail");
  });
});
