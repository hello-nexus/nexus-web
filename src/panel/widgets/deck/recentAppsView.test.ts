// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { buildRecentAppsView, type RecentAppsViewPage } from './recentAppsView';
import type { RecentApp } from '../../../api/deck';
import vectorsFile from './recentAppsView.vectors.json';

interface RecentAppsVectorCase {
  name: string;
  ring: RecentApp[];
  focusedProcessKey?: string | null;
  cols: number;
  rows: number;
  expected: RecentAppsViewPage[];
}

// Copied verbatim from the service worktree (see fitToGrid.vectors.json for
// the established pattern this mirrors). A static import so a missing/moved
// file fails this suite loudly instead of silently skipping it.
const { cases } = vectorsFile as { description: string; cases: RecentAppsVectorCase[] };

describe('buildRecentAppsView (shared vectors, mirrored in nexus-service/tests/Deck/recentAppsView.vectors.json)', () => {
  it.each(cases)('$name', ({ ring, focusedProcessKey, cols, rows, expected }) => {
    expect(buildRecentAppsView(ring, focusedProcessKey, cols, rows)).toEqual(expected);
  });
});

function app(processKey: string, over: Partial<RecentApp> = {}): RecentApp {
  return { processKey, name: processKey, lastFocusedUtcMs: 0, ...over };
}

describe('buildRecentAppsView (authored cases)', () => {
  it('fills every key MRU-ordered when entries fit exactly', () => {
    const pages = buildRecentAppsView([app('a'), app('b'), app('c'), app('d')], undefined, 2, 2);
    expect(pages).toHaveLength(1);
    expect(pages[0].map(k => (k.kind === 'app' ? k.processKey : k.kind))).toEqual(['a', 'b', 'c', 'd']);
  });

  it('puts the focused app first with focused:true, then MRU order', () => {
    const pages = buildRecentAppsView([app('a'), app('b'), app('c')], 'c', 2, 2);
    expect(pages[0][0]).toMatchObject({ kind: 'app', processKey: 'c', focused: true });
    expect(pages[0][1]).toMatchObject({ kind: 'app', processKey: 'a', focused: false });
    expect(pages[0][2]).toMatchObject({ kind: 'app', processKey: 'b', focused: false });
    expect(pages[0][3]).toEqual({ kind: 'blank' });
  });

  it('pads remaining keys blank when fewer entries than the grid', () => {
    const pages = buildRecentAppsView([app('a')], undefined, 2, 2);
    expect(pages[0].map(k => k.kind)).toEqual(['app', 'blank', 'blank', 'blank']);
  });

  it('does not mark any key focused when the focused process is absent from the ring', () => {
    const pages = buildRecentAppsView([app('a'), app('b')], 'zzz', 2, 2);
    expect(pages[0].every(k => k.kind !== 'app' || k.focused === false)).toBe(true);
  });

  it('carries shortcutId and exePath through onto the app key', () => {
    const pages = buildRecentAppsView([app('a', { shortcutId: 's1', exePath: 'C:\\a.exe' })], undefined, 2, 2);
    expect(pages[0][0]).toMatchObject({ shortcutId: 's1', exePath: 'C:\\a.exe' });
  });

  it('paginates overflow with navNext/navPrev keys, capped at 4 pages, dropping the remainder', () => {
    const ring = Array.from({ length: 20 }, (_, i) => app(`p${i}`));
    const pages = buildRecentAppsView(ring, undefined, 2, 2); // keyCount = 4
    expect(pages).toHaveLength(4);
    expect(pages[0].at(-1)).toEqual({ kind: 'navNext' });
    expect(pages[1][0]).toEqual({ kind: 'navPrev' });
    expect(pages[1].at(-1)).toEqual({ kind: 'navNext' });
    expect(pages[2][0]).toEqual({ kind: 'navPrev' });
    expect(pages[2].at(-1)).toEqual({ kind: 'navNext' });
    expect(pages[3][0]).toEqual({ kind: 'navPrev' });
    expect(pages[3].at(-1)).not.toEqual({ kind: 'navNext' });
  });

  it('one page exactly filling the grid needs no nav keys', () => {
    const ring = Array.from({ length: 4 }, (_, i) => app(`p${i}`));
    const pages = buildRecentAppsView(ring, undefined, 2, 2);
    expect(pages).toHaveLength(1);
    expect(pages[0].every(k => k.kind === 'app')).toBe(true);
  });

  it('truncates instead of chunking below the minimum viable grid (keyCount < 3)', () => {
    const pages = buildRecentAppsView([app('a'), app('b'), app('c')], undefined, 2, 1); // keyCount = 2
    expect(pages).toHaveLength(1);
    expect(pages[0].map(k => (k.kind === 'app' ? k.processKey : k.kind))).toEqual(['a', 'b']);
  });

  it('an empty ring renders every key blank', () => {
    const pages = buildRecentAppsView([], undefined, 2, 2);
    expect(pages).toHaveLength(1);
    expect(pages[0].every(k => k.kind === 'blank')).toBe(true);
  });
});
