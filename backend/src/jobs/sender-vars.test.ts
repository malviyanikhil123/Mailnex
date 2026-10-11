import { describe, it, expect } from "vitest";
import { buildSenderVars } from "./sender-vars.js";
import { RESERVED_PROFILE_KEYS } from "../modules/settings/settings.schema.js";

describe("buildSenderVars", () => {
  it("fills the {{my_*}} variables and the signature from the profile", () => {
    const vars = buildSenderVars(
      {
        name: "Priya Shah", company: "Acme Corp", email: "p@acme.com", phone: "+1 555 0100",
        website: "https://acme.com", linkedin: "https://linkedin.com/in/priya",
      },
      "Best regards,\nPriya Shah",
    );
    expect(vars).toMatchObject({
      my_name: "Priya Shah",
      my_company: "Acme Corp",
      my_email: "p@acme.com",
      my_phone: "+1 555 0100",
      my_website: "https://acme.com",
      my_linkedin: "https://linkedin.com/in/priya",
      signature: "Best regards,\nPriya Shah",
    });
  });

  it("leaves empty strings for missing fields rather than undefined", () => {
    const vars = buildSenderVars({}, "");
    expect(vars.my_company).toBe("");
    expect(Object.values(vars).every((v) => typeof v === "string")).toBe(true);
  });

  it("keeps the legacy job-seeker variables resolving from what is stored", () => {
    const vars = buildSenderVars(
      {
        name: "Alex", email: "a@x.dev", phone: "999", linkedin: "li", role: "Backend Engineer",
        experience: "5 years", skills: ["Node.js", "", "SQL"], github: "gh", portfolio: "https://a.dev",
      },
      "sig",
    );
    expect(vars).toMatchObject({
      name: "Alex", candidateName: "Alex", email: "a@x.dev", candidateEmail: "a@x.dev", phone: "999",
      linkedin: "li", LinkedIn: "li", github: "gh", GitHub: "gh",
      portfolio: "https://a.dev", Portfolio: "https://a.dev",
      role: "Backend Engineer", targetRole: "Backend Engineer", experience: "5 years", skills: "Node.js, SQL",
    });
    expect(buildSenderVars({}, "").role).toBe("");
    expect(buildSenderVars({ role: "  " }, "").targetRole).toBe("");
  });

  it("only produces variables that custom profile fields may not shadow", () => {
    const keys = Object.keys(buildSenderVars({}, ""));
    const reserved = RESERVED_PROFILE_KEYS as readonly string[];
    expect(keys.filter((k) => !reserved.includes(k))).toEqual([]);
  });
});
