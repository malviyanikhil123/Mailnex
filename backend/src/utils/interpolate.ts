/**
 * Replaces all `{{key}}` placeholders in `tpl` with the corresponding value
 * from `vars`. Placeholders whose key is missing are left as-is.
 */
export function interpolate(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    return Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : `{{${key}}}`;
  });
}
