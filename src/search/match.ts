import type { SearchEntry } from './types';

const BOUNDARY = /[\s\-_/.·›]/;

/**
 * Fuzzy match `query` against `text`. Returns a score (higher = better) or
 * null when query is not even a subsequence of text. Case-insensitive.
 *
 * Tiered so the common, confident cases dominate ranking:
 *   exact > prefix > word-boundary substring > substring > subsequence.
 * Within the subsequence tier, contiguous runs and matches at word
 * boundaries (start of a word) earn bonuses, and shorter text wins ties.
 *
 * Hand-rolled rather than a fuzzy-search dependency: the corpus is a few
 * hundred static entries, so this is plenty fast and keeps the bundle lean.
 */
export function fuzzyScore(query: string, text: string): number | null {
  if (!query) return 1;
  const q = query.toLowerCase();
  const s = text.toLowerCase();

  if (s === q) return 10_000;

  const sub = s.indexOf(q);
  if (sub === 0) return 6000 - s.length;
  if (sub > 0) {
    const boundary = BOUNDARY.test(s[sub - 1]);
    return (boundary ? 4000 : 2500) - sub - s.length * 0.1;
  }

  // Subsequence: every char of q must appear in order within s.
  let qi = 0;
  let score = 0;
  let prev = -2;
  let streak = 0;
  for (let si = 0; si < s.length && qi < q.length; si++) {
    if (s[si] !== q[qi]) continue;
    let bonus = 10;
    if (si === prev + 1) {
      streak += 1;
      bonus += 15 * streak; // reward contiguous runs
    } else {
      streak = 0;
    }
    if (si === 0 || BOUNDARY.test(s[si - 1])) bonus += 25; // word start
    score += bonus;
    prev = si;
    qi += 1;
  }
  if (qi < q.length) return null;
  return score - s.length * 0.1;
}

/**
 * Best score for an entry across its title (full weight), keywords (0.8),
 * and subtitle (0.55). Returns null if nothing matches.
 */
// Banded so WHERE the query matches dominates: a title hit always outranks a
// keyword-only hit, which outranks a subtitle-only hit. Within a band the fuzzy
// strength orders them. This is why searching "tray" puts the entry titled
// "Show icon in tray" above "Settings › General" (which only has tray as a
// keyword).
const TITLE_BAND = 2_000_000;
const KEYWORD_BAND = 1_000_000;

export function scoreEntry(query: string, entry: SearchEntry): number | null {
  const title = fuzzyScore(query, entry.title);
  if (title != null) return TITLE_BAND + title;

  let keyword: number | null = null;
  if (entry.keywords) {
    for (const k of entry.keywords) {
      const s = fuzzyScore(query, k);
      if (s != null && (keyword == null || s > keyword)) keyword = s;
    }
  }
  if (keyword != null) return KEYWORD_BAND + keyword;

  return entry.subtitle ? fuzzyScore(query, entry.subtitle) : null;
}
