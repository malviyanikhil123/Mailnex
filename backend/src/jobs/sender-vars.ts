import type { CandidateProfile } from "../modules/settings/settings.schema.js";

/**
 * Template variables that describe the sender ("My Profile"), e.g. {{name}}, {{signature}}.
 * Kept apart from contact variables so each side can change without touching the other.
 */
export function buildSenderVars(profile: CandidateProfile, signature: string): Record<string, string> {
  const userRole = profile.role?.trim() || "the open role";
  const userExperience = profile.experience?.trim() || "";
  const userSkills = profile.skills
    ? Array.isArray(profile.skills)
      ? profile.skills.filter(Boolean).join(", ")
      : profile.skills.trim()
    : "";

  return {
    candidateName: profile.name ?? "",
    name: profile.name ?? "",
    candidateEmail: profile.email ?? "",
    email: profile.email ?? "",
    phone: profile.phone ?? "",
    role: userRole,
    targetRole: userRole,
    experience: userExperience,
    skills: userSkills,
    linkedin: profile.linkedin ?? "",
    LinkedIn: profile.linkedin ?? "",
    github: profile.github ?? "",
    GitHub: profile.github ?? "",
    portfolio: profile.portfolio ?? "",
    Portfolio: profile.portfolio ?? "",
    signature,
  };
}
