import { describe, expect, it } from 'vitest';
import {
  appsToProcessListItems, fillAppGaps, nearestAppValueAt, nearestPointIndex,
  reconcileLiveWithWindow, topAppsAtHover, zeroedGpuFallback,
} from './appWindowHelpers';
import type { AppWindowPoint, AppWindowSeries } from '../../../../api/monitoringHistoryApps';
import type { ProcessListItem } from './ProcessListSection';

describe('nearestPointIndex', () => {
  const points = [{ t: 0, avg: 1 }, { t: 100, avg: 2 }, { t: 200, avg: 3 }, { t: 300, avg: 4 }];

  it('finds an exact match', () => {
    expect(nearestPointIndex(points, 200)).toBe(2);
  });

  it('rounds to the nearer neighbor between two points', () => {
    expect(nearestPointIndex(points, 140)).toBe(1);
    expect(nearestPointIndex(points, 160)).toBe(2);
  });

  it('ties go to the earlier point', () => {
    expect(nearestPointIndex(points, 150)).toBe(1);
  });

  it('clamps to the first/last point outside the range', () => {
    expect(nearestPointIndex(points, -50)).toBe(0);
    expect(nearestPointIndex(points, 9999)).toBe(3);
  });

  it('returns -1 for an empty array', () => {
    expect(nearestPointIndex([], 100)).toBe(-1);
  });
});

describe('nearestAppValueAt', () => {
  it('returns the nearest point value', () => {
    expect(nearestAppValueAt([{ t: 0, avg: 5 }, { t: 1000, avg: 9 }], 900)).toBe(9);
  });

  it('returns null for an empty series', () => {
    expect(nearestAppValueAt([], 100)).toBeNull();
  });
});

describe('topAppsAtHover', () => {
  function app(name: string, points: Array<{ t: number; avg: number }>): AppWindowSeries {
    return { name, avg: 0, max: 0, points };
  }

  it('re-ranks by the value AT the hovered instant, not the window-average order', () => {
    const apps = [
      app('chrome.exe', [{ t: 0, avg: 80 }, { t: 1000, avg: 5 }]),
      app('Nexus', [{ t: 0, avg: 10 }, { t: 1000, avg: 60 }]),
    ];
    // At t=0 chrome leads; at t=1000 Nexus leads - the window-average fetch
    // ranking (not modeled here) must not leak into the hover result.
    expect(topAppsAtHover(apps, 0, 8).map(e => e.name)).toEqual(['chrome.exe', 'Nexus']);
    expect(topAppsAtHover(apps, 1000, 8).map(e => e.name)).toEqual(['Nexus', 'chrome.exe']);
  });

  it('slices to the requested limit', () => {
    const apps = [
      app('a', [{ t: 0, avg: 1 }]),
      app('b', [{ t: 0, avg: 2 }]),
      app('c', [{ t: 0, avg: 3 }]),
    ];
    expect(topAppsAtHover(apps, 0, 2).map(e => e.name)).toEqual(['c', 'b']);
  });

  it('omits an app with no points at all', () => {
    const apps = [app('empty', []), app('present', [{ t: 0, avg: 5 }])];
    expect(topAppsAtHover(apps, 0, 8).map(e => e.name)).toEqual(['present']);
  });
});

describe('appsToProcessListItems', () => {
  it('maps avg to current, points to values, and carries startedAtMs', () => {
    const apps: AppWindowSeries[] = [
      { name: 'chrome.exe', startedAtMs: 500, avg: 12.3, max: 20, points: [{ t: 0, avg: 10 }, { t: 1000, avg: 14 }] },
    ];
    expect(appsToProcessListItems(apps)).toEqual([
      { name: 'chrome.exe', current: 12.3, values: [10, 14], startedAtMs: 500 },
    ]);
  });

  it('leaves startedAtMs undefined when the response omits it', () => {
    const apps: AppWindowSeries[] = [{ name: 'Nexus', avg: 1, max: 1, points: [] }];
    expect(appsToProcessListItems(apps)[0].startedAtMs).toBeUndefined();
  });
});

describe('reconcileLiveWithWindow (item 48: complete live list + window reconciliation)', () => {
  function liveItem(over: Partial<ProcessListItem> & { name: string }): ProcessListItem {
    return { current: 0, values: [], ...over };
  }

  it('keeps the window-scoped avg/points/startedAtMs for a name present in both', () => {
    const live = [liveItem({ name: 'chrome.exe', current: 5, values: [1, 2, 3] })];
    const windowApps: AppWindowSeries[] = [
      { name: 'chrome.exe', startedAtMs: 900, avg: 12, max: 20, points: [{ t: 0, avg: 10 }, { t: 1000, avg: 14 }] },
    ];
    expect(reconcileLiveWithWindow(live, windowApps)).toEqual([
      { name: 'chrome.exe', current: 12, values: [10, 14], startedAtMs: 900, secondary: undefined },
    ]);
  });

  it('shows a live-only app (absent from the top-N window response) at its live value with a flat sparkline', () => {
    const live = [liveItem({ name: 'explorer.exe', current: 0.4, values: [0, 1, 0] })];
    expect(reconcileLiveWithWindow(live, [])).toEqual([
      { name: 'explorer.exe', current: 0.4, values: expect.any(Array) },
    ]);
    const result = reconcileLiveWithWindow(live, [])[0];
    expect(result.values.every(v => v === 0.4)).toBe(true);
    expect(result.values.length).toBeGreaterThanOrEqual(30);
  });

  it('shows ALL live processes, not just the ones the window response covers (list completeness)', () => {
    const live = [
      liveItem({ name: 'chrome.exe', current: 40 }),
      liveItem({ name: 'explorer.exe', current: 0.2 }),
      liveItem({ name: 'svchost.exe', current: 0.1 }),
    ];
    const windowApps: AppWindowSeries[] = [
      { name: 'chrome.exe', avg: 38, max: 50, points: [{ t: 0, avg: 38 }] },
    ];
    const names = reconcileLiveWithWindow(live, windowApps).map(i => i.name);
    expect(names).toEqual(['chrome.exe', 'explorer.exe', 'svchost.exe']);
  });

  it('preserves the live secondary value (e.g. GPU VRAM text) even for a window-matched row', () => {
    const live = [liveItem({ name: 'Nexus', current: 10, secondary: '512 MB' })];
    const windowApps: AppWindowSeries[] = [{ name: 'Nexus', avg: 8, max: 15, points: [{ t: 0, avg: 8 }] }];
    expect(reconcileLiveWithWindow(live, windowApps)[0].secondary).toBe('512 MB');
  });

  it('includes a window-only app not present in the live list, sourced from the window data alone', () => {
    const windowApps: AppWindowSeries[] = [
      { name: 'JustExited.exe', startedAtMs: 100, avg: 3, max: 5, points: [{ t: 0, avg: 3 }] },
    ];
    expect(reconcileLiveWithWindow([], windowApps)).toEqual([
      { name: 'JustExited.exe', current: 3, values: [3], startedAtMs: 100 },
    ]);
  });
});

describe('zeroedGpuFallback (item 51: GPU tab with no per-process telemetry)', () => {
  it('zeroes current and every sparkline value while keeping names and startedAtMs', () => {
    const live: ProcessListItem[] = [
      { name: 'chrome.exe', current: 40, values: [10, 20, 30], startedAtMs: 500 },
    ];
    expect(zeroedGpuFallback(live)).toEqual([
      { name: 'chrome.exe', current: 0, values: [0, 0, 0], startedAtMs: 500 },
    ]);
  });

  it('handles an empty live list', () => {
    expect(zeroedGpuFallback([])).toEqual([]);
  });
});

describe('fillAppGaps (item 52: within-window absence reads as zero, not a gap)', () => {
  function points(pairs: Array<[number, number]>): AppWindowPoint[] {
    return pairs.map(([t, avg]) => ({ t, avg }));
  }

  it('leaves fewer than 2 points unchanged', () => {
    expect(fillAppGaps([])).toEqual([]);
    expect(fillAppGaps(points([[0, 5]]))).toEqual(points([[0, 5]]));
  });

  it('leaves evenly-spaced points (no gap) unchanged', () => {
    const evenly = points([[0, 1], [1000, 2], [2000, 3], [3000, 4]]);
    expect(fillAppGaps(evenly)).toEqual(evenly);
  });

  it('fills a missing stretch between two samples as zero, at the series\' own median spacing', () => {
    // Regular 1000ms cadence, but a single sample is missing at t=3000 -
    // the resulting 4000ms gap must be filled with zero point(s), not left
    // as a jump straight from t=2000 to t=6000.
    const withGap = points([[0, 1], [1000, 2], [2000, 3], [6000, 4]]);
    const filled = fillAppGaps(withGap);
    expect(filled[0]).toEqual({ t: 0, avg: 1 });
    expect(filled[1]).toEqual({ t: 1000, avg: 2 });
    expect(filled[2]).toEqual({ t: 2000, avg: 3 });
    // Every inserted point in the gap is zero.
    const inserted = filled.filter(p => p.t > 2000 && p.t < 6000);
    expect(inserted.length).toBeGreaterThan(0);
    expect(inserted.every(p => p.avg === 0)).toBe(true);
    expect(filled[filled.length - 1]).toEqual({ t: 6000, avg: 4 });
  });

  it('never invents a point before the first sample or after the last (observed-lifetime clamp)', () => {
    const withGap = points([[1000, 5], [2000, 6], [9000, 7]]);
    const filled = fillAppGaps(withGap);
    expect(Math.min(...filled.map(p => p.t))).toBe(1000);
    expect(Math.max(...filled.map(p => p.t))).toBe(9000);
  });

  it('produces a result whose own gap-detection (median-spacing-based) sees no remaining gap', () => {
    // After filling, the array's own recomputed spacing should no longer
    // contain any delta exceeding GAP_MULTIPLIER times the new median -
    // i.e. the clicked-app mini chart (which runs the same gap-detection
    // over whatever points it's given) would render one continuous run.
    const withGap = points([[0, 10], [1000, 12], [2000, 11], [20000, 9], [21000, 8]]);
    const filled = fillAppGaps(withGap);
    const deltas: number[] = [];
    for (let i = 1; i < filled.length; i++) deltas.push(filled[i].t - filled[i - 1].t);
    const sorted = [...deltas].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    expect(Math.max(...deltas)).toBeLessThanOrEqual(median * 1.5);
  });

  it('never exceeds the defensive MAX_FILLED_POINTS cap, even on a single pathologically wide gap', () => {
    // 20 points on a regular 1000ms cadence (so the median spacing genuinely
    // reflects that cadence) followed by one enormous gap - naive filling at
    // 1000ms across that gap would produce ~10,000 synthetic points.
    const regular: Array<[number, number]> = Array.from({ length: 20 }, (_, i) => [i * 1000, i]);
    const pathological = points([...regular, [10_000_000, 99]]);
    const filled = fillAppGaps(pathological);
    expect(filled.length).toBeLessThanOrEqual(500);
    expect(filled[0]).toEqual({ t: 0, avg: 0 });
    expect(filled[filled.length - 1]).toEqual({ t: 10_000_000, avg: 99 });
  });
});
