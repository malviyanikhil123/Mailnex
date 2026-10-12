/** Longest search term the list endpoints accept. */
export const SEARCH_MAX_LENGTH = 200;

/**
 * A LIKE / ILIKE pattern matching `term` anywhere in the value. `%`, `_` and the
 * escape character itself are escaped, so a search is always literal: "50%" finds
 * "50%" rather than everything starting with "50", and "_" no longer matches any
 * character. Postgres uses backslash as the default LIKE escape.
 */
export function likeContains(term: string): string {
  return "%" + term.replace(/[\\%_]/g, (ch) => "\\" + ch) + "%";
}
