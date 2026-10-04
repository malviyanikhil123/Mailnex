/**
 * Replaces all `{{key}}` placeholders in `tpl` with the corresponding value
 * from `vars`. Placeholders whose key is missing are left as-is.
 * Keys may contain hyphens, dots, or surrounding spaces (e.g. `{{ first-name }}`).
 */
export function interpolate(tpl: string, vars: Record<string, string>): string {
  const lowerMap = new Map<string, string>();
  for (const [k, v] of Object.entries(vars)) {
    lowerMap.set(k.toLowerCase(), v);
  }

  return tpl.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (match, rawKey) => {
    const key = rawKey.trim();
    if (Object.prototype.hasOwnProperty.call(vars, key)) {
      return vars[key];
    }
    const lower = key.toLowerCase();
    if (lowerMap.has(lower)) {
      return lowerMap.get(lower)!;
    }
    return match;
  });
}
