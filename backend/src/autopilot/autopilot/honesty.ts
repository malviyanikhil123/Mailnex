/**
 * The rule that the tailored resume may reword what is true, but may never invent.
 *
 * Asking the model nicely is not a rule, it is a hope. So every reworded line is checked
 * against the line it came from: a rewording may drop words, reorder them and swap phrasing,
 * but it may not introduce a new hard fact — a tool, a technology, a number or a named
 * system that was not there before and is nowhere in the person's own skills.
 *
 * Anything that fails goes back to the original wording. A slightly clumsy true line beats
 * a polished false one.
 */

/** Words that carry a claim: tools, systems, numbers, acronyms, proper nouns. */
function hardFacts(text: string): Set<string> {
  const out = new Set<string>();

  // Numbers, including percentages and amounts — "cut rework by 20%" must not become 40%.
  for (const m of text.matchAll(/\b\d+(?:[.,]\d+)?\s*%?\b/g)) out.add(m[0].replace(/\s+/g, ''));

  // Tool-shaped words: capitalised mid-sentence, all-caps acronyms, or dotted/plus names.
  for (const word of text.split(/[\s,;:()[\]/]+/)) {
    const w = word.replace(/[.,;:!?'"]+$/, '');
    if (!w || w.length < 2) continue;
    const acronym = /^[A-Z]{2,}$/.test(w);
    const dotted = /^[A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z]+|\+\+|#)$/.test(w);
    const proper = /^[A-Z][a-zA-Z0-9]+$/.test(w);
    if (acronym || dotted || proper) out.add(w.toLowerCase());
  }
  return out;
}

/** Words so ordinary that their appearing is no claim at all. */
const HARMLESS = new Set([
  'the', 'this', 'that', 'these', 'those', 'and', 'for', 'with', 'from', 'into', 'across', 'through',
  'led', 'built', 'ran', 'made', 'used', 'i', 'we', 'my', 'our', 'a', 'an', 'to', 'of', 'in', 'on', 'by',
  'delivered', 'designed', 'developed', 'managed', 'created', 'improved', 'reduced', 'increased',
  'analysed', 'analyzed', 'authored', 'prepared', 'supported', 'worked', 'collaborated', 'ensured',
]);

export type Checked = { line: string; kept: boolean; added: string[] };

/**
 * Compares a reworded line against its original and whatever the person can honestly
 * claim (their own skills and the rest of their resume). Returns the line to use.
 */
export function checkRewording(original: string, reworded: string, allowed: string[]): Checked {
  const before = hardFacts(original);
  const canSay = new Set(allowed.map((a) => a.toLowerCase()));
  const after = hardFacts(reworded);

  const added = [...after].filter((fact) => {
    if (before.has(fact) || HARMLESS.has(fact)) return false;
    if (canSay.has(fact)) return false;
    // "RESTful" against an original saying "REST" is the same claim said differently.
    for (const known of [...before, ...canSay]) {
      if (known.length > 2 && (fact.startsWith(known) || known.startsWith(fact))) return false;
    }
    return true;
  });

  // A rewording that says far more than the original is padding, whatever it contains.
  const tooLong = reworded.length > original.length * 1.8 + 30;

  return added.length || tooLong
    ? { line: original, kept: false, added }
    : { line: reworded, kept: true, added: [] };
}

/** Everything this person can honestly claim, gathered from their own words. */
export function allowedFrom(texts: string[]): Set<string> {
  const out = new Set<string>();
  for (const t of texts) for (const fact of hardFacts(t)) out.add(fact);
  return out;
}

/**
 * Hard facts in a piece of writing that the person's own history does not support.
 *
 * The summary at the top of a resume and the cover letter are written from nothing,
 * not reworded from a line, so they cannot be compared against an original — but they
 * still go to an employer with the person's name on them. They are checked against
 * everything the person has actually written about themselves.
 */
export function inventedIn(text: string, allowed: Set<string>): string[] {
  return [...hardFacts(text)].filter((fact) => {
    if (HARMLESS.has(fact) || allowed.has(fact)) return false;
    for (const known of allowed) {
      if (known.length > 2 && (fact.startsWith(known) || known.startsWith(fact))) return false;
    }
    return true;
  });
}

/** Removes the sentences carrying a claim the person cannot make, and keeps the rest. */
export function withoutInvention(text: string, allowed: Set<string>): { text: string; dropped: string[] } {
  const dropped: string[] = [];
  const kept = text
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => {
      const bad = inventedIn(sentence, allowed);
      if (bad.length) { dropped.push(...bad); return false; }
      return true;
    });
  return { text: kept.join(' ').trim(), dropped: [...new Set(dropped)] };
}
