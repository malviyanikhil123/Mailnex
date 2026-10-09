import type { SenderProfile } from "../modules/settings/settings.schema.js";

/**
 * Template variables that describe the sender ("My Profile"), e.g. {{my_name}}, {{signature}}.
 * Kept apart from contact variables so each side can change without touching the other.
 */
export function buildSenderVars(profile: SenderProfile, signature: string): Record<string, string> {
  return {
    my_name: profile.name ?? "",
    my_company: profile.company ?? "",
    my_email: profile.email ?? "",
    my_phone: profile.phone ?? "",
    my_website: profile.website ?? "",
    my_linkedin: profile.linkedin ?? "",
    signature,
    ...buildLegacySenderVars(profile),
  };
}

/**
 * Variables from the job-seeker version of My Profile. The form no longer edits most of
 * them, but templates written back then still use them, so they keep resolving from
 * whatever is stored.
 */
function buildLegacySenderVars(profile: SenderProfile): Record<string, string> {
  const role = profile.role?.trim() || "the open role";
  const skills = profile.skills
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
    role,
    targetRole: role,
    experience: profile.experience?.trim() || "",
    skills,
    linkedin: profile.linkedin ?? "",
    LinkedIn: profile.linkedin ?? "",
    github: profile.github ?? "",
    GitHub: profile.github ?? "",
    portfolio: profile.portfolio ?? "",
    Portfolio: profile.portfolio ?? "",
  };
}
