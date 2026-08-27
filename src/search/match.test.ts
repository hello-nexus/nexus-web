// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { fuzzyScore, scoreEntry } from './match';
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
