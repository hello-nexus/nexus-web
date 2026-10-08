// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { fuzzyScore, matchesAllWords, scoreEntry } from './match';
import type { SearchEntry } from './types';

const entry = (over: Partial<SearchEntry>): SearchEntry => ({
  id: 'x', title: 'X', kind: 'navigate', run: () => {}, ...over,
});

describe('fuzzyScore', () => {
  it('ranks exact > prefix > substring > subsequence', () => {
    const exact = fuzzyScore('cooling', 'cooling')!;
    const prefix = fuzzyScore('cool', 'cooling')!;
    const sub = fuzzyScore('ling', 'cooling')!;
    const subseq = fuzzyScore('clng', 'cooling')!;
    expect(exact).toBeGreaterThan(prefix);
    expect(prefix).toBeGreaterThan(sub);
    expect(sub).toBeGreaterThan(subseq);
  });

  it('is case-insensitive and returns null on no match', () => {
    expect(fuzzyScore('MON', 'Monitoring')).not.toBeNull();
    expect(fuzzyScore('xyz', 'Monitoring')).toBeNull();
  });

  it('rewards word-boundary starts', () => {
    const boundary = fuzzyScore('fc', 'fan curve')!;   // f…c at word starts
    const scattered = fuzzyScore('ac', 'fan curve')!;  // a…c mid-word
    expect(boundary).toBeGreaterThan(scattered);
  });
});

describe('scoreEntry', () => {
  it('matches against keywords', () => {
    const e = entry({ title: 'Monitoring', keywords: ['cpu', 'gpu', 'temps'] });
    expect(scoreEntry('cpu', e)).not.toBeNull();
    expect(scoreEntry('temps', e)).not.toBeNull();
  });

  it('weights a title match above a keyword match for the same query', () => {
    const titled = entry({ id: 'a', title: 'Cooling' });
    const keyworded = entry({ id: 'b', title: 'Fans', keywords: ['cooling'] });
    expect(scoreEntry('cool', titled)!).toBeGreaterThan(scoreEntry('cool', keyworded)!);
  });

  it('an exact alias outranks a fuzzy title hit and ignores a leading slash', () => {
    const aliased = entry({ id: 'a', title: 'Export support bundle', aliases: ['logs'] });
    const subsequence = entry({ id: 'b', title: 'Language · Português' });
    expect(scoreEntry('logs', aliased)!).toBeGreaterThan(scoreEntry('logs', subsequence)!);
    expect(scoreEntry('/logs', aliased)).toBe(scoreEntry('logs', aliased));
    expect(scoreEntry('LOGS', aliased)).toBe(scoreEntry('logs', aliased));
    expect(scoreEntry('log', aliased)).toBeNull(); // partial alias is not a title hit
  });

  it('a title hit always outranks a keyword-only hit (banding)', () => {
    // "tray" must put the entry titled "Show icon in tray" above one that only
    // has tray as a keyword (e.g. the Settings tab), even on an exact keyword.
    const titled = entry({ id: 'a', title: 'Show icon in tray', keywords: ['tray'] });
    const keyworded = entry({ id: 'b', title: 'Settings › General', keywords: ['tray'] });
    expect(scoreEntry('tray', titled)!).toBeGreaterThan(scoreEntry('tray', keyworded)!);
  });

  it('returns null when nothing matches', () => {
    expect(scoreEntry('zzzz', entry({ title: 'Lighting' }))).toBeNull();
  });
});

describe('matchesAllWords', () => {
  it('matches when every word appears in some field, in any order', () => {
    expect(matchesAllWords('strimer lian', ['Lian Li', 'Strimer L Connect'])).toBe(true);
    expect(matchesAllWords('LIAN', ['Lian Li Uni Hub'])).toBe(true);
  });

  it('fails when any word is missing', () => {
    expect(matchesAllWords('lian kraken', ['Lian Li Uni Hub'])).toBe(false);
  });

  it('never matches one word across two fields', () => {
    expect(matchesAllWords('lili', ['Li', 'Li'])).toBe(false);
  });

  it('matches everything on an empty or blank query, and skips missing fields', () => {
    expect(matchesAllWords('', [])).toBe(true);
    expect(matchesAllWords('   ', ['x'])).toBe(true);
    expect(matchesAllWords('fan', [undefined, null, 'Rear fan'])).toBe(true);
  });
});
