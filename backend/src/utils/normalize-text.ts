/**
 * Text normalization shared by the rule editor and the rule matcher.
 *
 * Both sides must use the SAME function or they silently drift apart: the service
 * computes `valueNormalized` when a rule is saved, and the engine normalizes the
 * message at match time. Keeping one implementation is what makes matching
 * case-, accent- and whitespace-insensitive without anyone having to think about it.
 */

/** NFKC-fold, lowercase, collapse whitespace, trim. */
export function normalizeForMatch(s: string): string {
  if (!s) return "";
  return s.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}

/** URL/identity-safe slug used for the per-user category uniqueness index. */
export function toSlug(s: string): string {
  return normalizeForMatch(s)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "");
}

/** Everything after the last "@", lowercased. Empty string when there is no domain. */
export function domainOf(address: string): string {
  if (!address) return "";
  const at = address.lastIndexOf("@");
  if (at < 0 || at === address.length - 1) return "";
  return address.slice(at + 1).trim().toLowerCase().replace(/[>\s]+$/, "");
}
