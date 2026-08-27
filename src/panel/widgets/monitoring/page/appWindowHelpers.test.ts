// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  appsToProcessListItems, currentAppValueMap, fillAppGaps, nearestAppValueAt, nearestPointIndex,
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

describe('currentAppValueMap (point-in-time snapshot)', () => {
  function app(name: string, points: Array<{ t: number; avg: number }>): AppWindowSeries {
    return { name, avg: 0, max: 0, points };
  }

  it('maps each app to its value at the nearest point to t', () => {
    const apps = [
      app('chrome.exe', [{ t: 0, avg: 80 }, { t: 1000, avg: 5 }]),
      app('Nexus', [{ t: 0, avg: 10 }, { t: 1000, avg: 60 }]),
    ];
    const map = currentAppValueMap(apps, 900);
    expect(map.get('chrome.exe')).toBe(5);
    expect(map.get('Nexus')).toBe(60);
  });

  it('omits an app with no points at all', () => {
    const apps = [app('empty', []), app('present', [{ t: 0, avg: 5 }])];
    const map = currentAppValueMap(apps, 0);
    expect(map.has('empty')).toBe(false);
    expect(map.get('present')).toBe(5);
  });

  it('returns an empty map for no apps', () => {
    expect(currentAppValueMap([], 0).size).toBe(0);
  });
});

describe('appsToProcessListItems', () => {
  it('maps avg to current, points to values, and carries startedAtMs', () => {
    const apps: AppWindowSeries[] = [
      { name: 'chrome.exe', startedAtMs: 500, avg: 12.3, max: 20, points: [{ t: 0, avg: 10 }, { t: 1000, avg: 14 }] },
    ];
    expect(appsToProcessListItems(apps, [])).toEqual([
      { name: 'chrome.exe', current: 12.3, values: [10, 14], startedAtMs: 500 },
    ]);
  });

  it('leaves startedAtMs undefined when the response omits it', () => {
    const apps: AppWindowSeries[] = [{ name: 'Nexus', avg: 1, max: 1, points: [] }];
    expect(appsToProcessListItems(apps, [])[0].startedAtMs).toBeUndefined();
  });

  it('looks up isApp/publisher/signed from the live list by name (round 5 items 5/6, the detached path)', () => {
    const apps: AppWindowSeries[] = [{ name: 'chrome.exe', avg: 12, max: 20, points: [{ t: 0, avg: 12 }] }];
    const liveItems: ProcessListItem[] = [
      { name: 'chrome.exe', current: 40, values: [1], isApp: true, publisher: 'Google LLC', signed: 'signed' },
    ];
    const result = appsToProcessListItems(apps, liveItems)[0];
    expect(result.isApp).toBe(true);
    expect(result.publisher).toBe('Google LLC');
    expect(result.signed).toBe('signed');
  });

  it('leaves isApp/publisher/signed undefined for a window app with no matching live row', () => {
    const apps: AppWindowSeries[] = [{ name: 'JustExited.exe', avg: 3, max: 5, points: [{ t: 0, avg: 3 }] }];
    const result = appsToProcessListItems(apps, [])[0];
    expect(result.isApp).toBeUndefined();
    expect(result.publisher).toBeUndefined();
    expect(result.signed).toBeUndefined();
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

  it('keeps a live-only app\'s own sparkline (absent from the top-N window response) rather than flattening it', () => {
    const live = [liveItem({ name: 'explorer.exe', current: 0.4, values: [0, 1, 0.8] })];
    expect(reconcileLiveWithWindow(live, [])).toEqual([
      { name: 'explorer.exe', current: 0.4, values: [0, 1, 0.8] },
    ]);
  });

  it('preserves every live row\'s own sparkline when the window response is supported but empty for the whole series', () => {
    const live = [
      liveItem({ name: 'chrome.exe', current: 40, values: [10, 20, 40] }),
      liveItem({ name: 'explorer.exe', current: 0.4, values: [0, 1, 0.8] }),
    ];
    const result = reconcileLiveWithWindow(live, []);
    expect(result.find(i => i.name === 'chrome.exe')?.values).toEqual([10, 20, 40]);
    expect(result.find(i => i.name === 'explorer.exe')?.values).toEqual([0, 1, 0.8]);
  });

  it('falls back to a flat sparkline only when the live row itself carries no history at all', () => {
    const live = [liveItem({ name: 'explorer.exe', current: 0.4, values: [] })];
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

  it('preserves isApp/publisher/signed from the live row for a window-matched entry (round 5 items 5/6, the primary following-live path)', () => {
    const live = [liveItem({
      name: 'chrome.exe', current: 40, isApp: true, publisher: 'Google LLC', signed: 'signed',
    })];
    const windowApps: AppWindowSeries[] = [{ name: 'chrome.exe', avg: 38, max: 50, points: [{ t: 0, avg: 38 }] }];
    const result = reconcileLiveWithWindow(live, windowApps)[0];
    expect(result.isApp).toBe(true);
    expect(result.publisher).toBe('Google LLC');
    expect(result.signed).toBe('signed');
  });

  it('preserves isApp/publisher/signed for a live-only row (no window match)', () => {
    const live = [liveItem({
      name: 'svchost.exe', current: 1, isApp: false, publisher: 'Microsoft Corporation', signed: 'signed',
    })];
    const result = reconcileLiveWithWindow(live, [])[0];
    expect(result.isApp).toBe(false);
    expect(result.publisher).toBe('Microsoft Corporation');
    expect(result.signed).toBe('signed');
  });

  it('includes a window-only app not present in the live list, sourced from the window data alone', () => {
    const windowApps: AppWindowSeries[] = [
      { name: 'JustExited.exe', startedAtMs: 100, avg: 3, max: 5, points: [{ t: 0, avg: 3 }] },
    ];
    expect(reconcileLiveWithWindow([], windowApps)).toEqual([
      { name: 'JustExited.exe', current: 3, values: [3], startedAtMs: 100 },
    ]);
  });

  it('dedups a duplicate name within the window response, keeping the first entry', () => {
    const windowApps: AppWindowSeries[] = [
      { name: 'svchost.exe', avg: 1, max: 1, points: [{ t: 0, avg: 1 }] },
      { name: 'svchost.exe', avg: 99, max: 99, points: [{ t: 0, avg: 99 }] },
    ];
    const live = [liveItem({ name: 'svchost.exe', current: 5, values: [5] })];
    const result = reconcileLiveWithWindow(live, windowApps);
    expect(result).toHaveLength(1);
    expect(result[0].current).toBe(1);
  });

  it('dedups a duplicate name within the live list, keeping the first entry, so the output never has two rows sharing a name', () => {
    const live = [
      liveItem({ name: 'svchost.exe', current: 5, values: [5] }),
      liveItem({ name: 'svchost.exe', current: 9, values: [9] }),
    ];
    const result = reconcileLiveWithWindow(live, []);
    expect(result).toHaveLength(1);
    expect(result.map(i => i.name)).toEqual(['svchost.exe']);
  });

  it('every output name is unique across mixed live and window duplicates', () => {
    const live = [
      liveItem({ name: 'a.exe', current: 1, values: [1] }),
      liveItem({ name: 'b.exe', current: 2, values: [2] }),
    ];
    const windowApps: AppWindowSeries[] = [
      { name: 'a.exe', avg: 10, max: 10, points: [{ t: 0, avg: 10 }] },
      { name: 'b.exe', avg: 20, max: 20, points: [{ t: 0, avg: 20 }] },
      { name: 'b.exe', avg: 21, max: 21, points: [{ t: 0, avg: 21 }] },
      { name: 'c.exe', avg: 30, max: 30, points: [{ t: 0, avg: 30 }] },
      { name: 'c.exe', avg: 31, max: 31, points: [{ t: 0, avg: 31 }] },
    ];
    const result = reconcileLiveWithWindow(live, windowApps);
    const names = result.map(i => i.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names.sort()).toEqual(['a.exe', 'b.exe', 'c.exe']);
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

  it('preserves isApp/publisher/signed from the live row (round 5 items 5/6)', () => {
    const live: ProcessListItem[] = [
      { name: 'chrome.exe', current: 40, values: [10, 20, 30], isApp: true, publisher: 'Google LLC', signed: 'signed' },
    ];
    const result = zeroedGpuFallback(live)[0];
    expect(result.isApp).toBe(true);
    expect(result.publisher).toBe('Google LLC');
    expect(result.signed).toBe('signed');
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
