import { describe, expect, it } from 'vitest';
import { buildLiveUsageByName, buildMiniChart, sessionsForProcess, truncateMiddle } from './processDetailHelpers';
import type { PrivacySession } from '../../../../api/monitoringPrivacy';
import type { SeriesEntry } from '../../../../hooks/useProcessMonitor';

function series(name: string, current: number): SeriesEntry {
  return { name, color: '', values: [], current, avg: current };
}

describe('truncateMiddle', () => {
  it('returns the input unchanged when it already fits', () => {
    expect(truncateMiddle('short.exe', 20)).toBe('short.exe');
  });

  it('drops the middle, keeping the head and tail', () => {
    const long = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    // 21 = head(10) + ellipsis(1) + tail(10), just enough for both checks
    // below to hold at once ("C:\Program" and "chrome.exe" are each 10
    // chars) - a tighter budget forces a real tradeoff processDetailHelpers
    // doesn't need to be exercised here.
    const result = truncateMiddle(long, 21);
    expect(result.length).toBeLessThanOrEqual(21);
    expect(result.startsWith('C:\\Program')).toBe(true);
    expect(result.endsWith('chrome.exe')).toBe(true);
    expect(result).toContain('…');
  });

  it('is a no-op for a degenerate maxChars', () => {
    expect(truncateMiddle('anything', 1)).toBe('anything');
  });
});

describe('sessionsForProcess', () => {
  const sessions: PrivacySession[] = [
    { app: 'C:\\chrome.exe', capability: 'webcam', start: 1000, end: 2000 },
    { app: 'C:\\firefox.exe', capability: 'webcam', start: 500, end: 1500 },
    { app: 'C:\\chrome.exe', capability: 'microphone', start: 3000, end: null },
  ];

  it('filters to sessions matching the process name', () => {
    const result = sessionsForProcess(sessions, 'chrome.exe');
    expect(result).toHaveLength(2);
    expect(result.every(s => s.app === 'C:\\chrome.exe')).toBe(true);
  });

  it('sorts newest first, with an active (end: null) session sorting as newest', () => {
    const result = sessionsForProcess(sessions, 'chrome.exe');
    expect(result[0].end).toBeNull();
    expect(result[1].end).toBe(2000);
  });

  it('returns an empty array when nothing matches', () => {
    expect(sessionsForProcess(sessions, 'Nexus')).toEqual([]);
  });
});

describe('buildLiveUsageByName', () => {
  it('merges per-metric series into one name-keyed record', () => {
    const map = buildLiveUsageByName(
      [series('chrome.exe', 12)],
      [series('chrome.exe', 512), series('Nexus', 80)],
      [series('chrome.exe', 4)],
      [series('chrome.exe', 900)],
    );
    expect(map.get('chrome.exe')).toEqual({ cpuPercent: 12, memoryMb: 512, gpuPercent: 4, vramMb: 900 });
  });

  it('keeps a partial entry for a process only some series report', () => {
    const map = buildLiveUsageByName([series('explorer.exe', 3)], [], [], []);
    expect(map.get('explorer.exe')).toEqual({ cpuPercent: 3 });
  });

  it('has no entry for a process reported by none of the series', () => {
    const map = buildLiveUsageByName([], [], [], []);
    expect(map.has('chrome.exe')).toBe(false);
  });
});

describe('buildMiniChart', () => {
  it('reports no data for fewer than two points', () => {
    expect(buildMiniChart([], 100, 40)).toEqual({ segments: [], hasData: false });
    expect(buildMiniChart([{ t: 0, avg: 5 }], 100, 40)).toEqual({ segments: [], hasData: false });
  });

  it('builds a single segment for continuously-spaced points', () => {
    const points = [
      { t: 0, avg: 10 }, { t: 1000, avg: 20 }, { t: 2000, avg: 30 }, { t: 3000, avg: 15 },
    ];
    const result = buildMiniChart(points, 100, 40);
    expect(result.hasData).toBe(true);
    expect(result.segments).toHaveLength(1);
    expect(result.segments[0].linePath.startsWith('M0.00,')).toBe(true);
    expect(result.segments[0].linePath).toContain('L100.00,');
  });

  it('breaks the line across a gap much wider than the median spacing', () => {
    const points = [
      { t: 0, avg: 10 }, { t: 1000, avg: 20 }, { t: 2000, avg: 30 },
      // A ~50s gap after a ~1s median spacing - well past GAP_MULTIPLIER (1.5x).
      { t: 52_000, avg: 25 }, { t: 53_000, avg: 22 },
    ];
    const result = buildMiniChart(points, 100, 40);
    expect(result.segments).toHaveLength(2);
  });

  it('drops an isolated single-point run (no line to draw)', () => {
    const points = [
      { t: 0, avg: 10 }, { t: 1000, avg: 20 },
      { t: 100_000, avg: 99 },
    ];
    const result = buildMiniChart(points, 100, 40);
    // The lone isolated point at t=100000 forms its own one-point run,
    // filtered out - only the first two-point run remains.
    expect(result.segments).toHaveLength(1);
  });

  it('pins the value floor at zero rather than auto-scaling to the data minimum', () => {
    const points = [{ t: 0, avg: 40 }, { t: 1000, avg: 80 }];
    const result = buildMiniChart(points, 100, 40);
    // avg=40 is half of the max (80), so with a zero floor its y sits at
    // the vertical midpoint (height / 2 = 20), not at the bottom (height).
    const secondCoordMatch = result.segments[0].linePath.match(/M0\.00,([\d.]+)/);
    expect(secondCoordMatch).not.toBeNull();
    expect(Number(secondCoordMatch![1])).toBeCloseTo(20, 0);
  });
});
