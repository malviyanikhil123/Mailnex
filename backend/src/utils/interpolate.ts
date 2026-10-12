export interface InterpolateOptions {
  /**
   * Applied to every variable value before it is inserted (e.g. HTML escaping for HTML
   * templates). Fallback texts are part of the template and are inserted as written.
   */
  escape?: (value: string) => string;
}

/**
 * Replaces all `{{key}}` placeholders in `tpl` with the corresponding value
 * from `vars`. Placeholders whose key is missing are left as-is; a key that is
 * present with an empty value renders as "".
 * Keys may contain hyphens, dots, or surrounding spaces (e.g. `{{ first-name }}`),
 * and match case-insensitively when there is no exact match.
 *
 * `{{key|fallback}}` renders the value, or `fallback` when the value is missing or
 * blank (e.g. `Hi {{first_name|there}},`). The fallback may be empty (`{{key|}}`)
 * and cannot contain `}`.
 */
export function interpolate(tpl: string, vars: Record<string, string>, options: InterpolateOptions = {}): string {
  const lowerMap = new Map<string, string>();
  for (const [k, v] of Object.entries(vars)) {
    lowerMap.set(k.toLowerCase(), v);
  }
  const lookup = (key: string): string | undefined => {
    if (Object.prototype.hasOwnProperty.call(vars, key)) return vars[key];
    return lowerMap.get(key.toLowerCase());
  };
  const escape = options.escape ?? ((value: string) => value);

  return tpl.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (match, rawKey: string) => {
    const key = rawKey.trim();
    const value = lookup(key);
    if (value !== undefined) return escape(value);

    const pipe = key.indexOf("|");
    if (pipe === -1) return match;
    const named = lookup(key.slice(0, pipe).trim());
    if (named !== undefined && named.trim() !== "") return escape(named);
    return key.slice(pipe + 1).trim();
  });
}
