import { describe, expect, it } from 'vitest';
import { appsToProcessListItems, nearestAppValueAt, nearestPointIndex, topAppsAtHover } from './appWindowHelpers';
import type { AppWindowSeries } from '../../../../api/monitoringHistoryApps';

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
