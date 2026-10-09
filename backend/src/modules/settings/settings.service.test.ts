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

  it("getPublic exposes booleans and the profile but NEVER decrypted secrets", async () => {
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
    expect(pub.profile).toEqual({});
    expect(pub).not.toHaveProperty("resumeFileName");
  });

  it("updateProfile merges with the existing profile", async () => {
    await service.updateProfile(userId, { name: "Priya Shah", company: "Acme Corp" });
    const merged = await service.updateProfile(userId, { phone: "12345" });
    expect(merged).toEqual({ name: "Priya Shah", company: "Acme Corp", phone: "12345" });
    expect(await service.getSenderProfile(userId)).toEqual(merged);
  });

  it("updateProfile keeps legacy job-seeker keys it does not edit", async () => {
    repo.app.candidateProfile = JSON.stringify({ name: "Nikhil", role: "Backend Engineer", skills: ["Node.js"] });
    const merged = await service.updateProfile(userId, { name: "Nikhil M", website: "https://n.dev" });
    expect(merged).toMatchObject({ name: "Nikhil M", website: "https://n.dev", role: "Backend Engineer", skills: ["Node.js"] });
  });

  it("getSenderProfile offers a legacy portfolio as the website until one is saved", async () => {
    repo.app.candidateProfile = JSON.stringify({ portfolio: "https://old.dev" });
    expect((await service.getSenderProfile(userId)).website).toBe("https://old.dev");

    await service.updateProfile(userId, { website: "" });
    const profile = await service.getSenderProfile(userId);
    expect(profile.website).toBe("");
    expect(profile.portfolio).toBe("https://old.dev");
  });

  it("getSenderProfile returns an empty profile for corrupt or non-object JSON", async () => {
    repo.app.candidateProfile = "{not json";
    expect(await service.getSenderProfile(userId)).toEqual({});
    repo.app.candidateProfile = "null";
    expect(await service.getSenderProfile(userId)).toEqual({});
  });

  it("buildSignature uses the user's own signature when set", () => {
    const sig = service.buildSignature({ name: "Priya", signature: "  Cheers,\nPriya\nAcme — acme.com  " });
    expect(sig).toBe("Cheers,\nPriya\nAcme — acme.com");
  });

  it("buildSignature defaults to name, company, phone and website, skipping blanks", () => {
    const sig = service.buildSignature({
      name: "Priya Shah",
      company: "Acme Corp",
      phone: " ",
      website: "https://acme.com",
      email: "p@acme.com",
      signature: "   ",
    });
    expect(sig).toBe("Best regards,\nPriya Shah\nAcme Corp\nhttps://acme.com");
    expect(service.buildSignature({})).toBe("Best regards,");
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
