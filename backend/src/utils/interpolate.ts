/**
 * Replaces all `{{key}}` placeholders in `tpl` with the corresponding value
 * from `vars`. Placeholders whose key is missing are left as-is.
 * Keys may contain hyphens, dots, or surrounding spaces (e.g. `{{ first-name }}`).
 */
export function interpolate(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (match, rawKey) => {
    const key = rawKey.trim();
    return Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : match;
  });
}
