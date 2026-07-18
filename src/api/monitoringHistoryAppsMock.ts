// Contract-shaped fixture for GET /monitoring/history/apps, used only as a
// dev-build fallback while the service route is still being built (parallel
// branch). Every app's value is a pure function of `t` and its own seed (no
// fixed anchor date, no Math.random), so a query for "now" always returns
// plausible fresh data and mirrors monitoringHistoryMock.ts's approach.

import type { AppWindowPoint, AppWindowSeries, MetricHistoryAppsQuery, MetricHistoryAppsResponse } from './monitoringHistoryApps';

const MINUTE_MS = 60_000;
const DEFAULT_MAX_APPS = 15;
const DEFAULT_MAX_POINTS = 100;

interface AppDef {
  name: string;
  seed: number;
  /** How many minutes before the query window this app is treated as having
   *  launched - a small value exercises the recency sort against apps that
   *  started well before the window. */
  launchedMinutesAgo: number;
  baseAt: (t: number, seed: number) => number;
  /** VRAM-in-MiB generator - only defined for GPU_APPS entries, mirroring the
   *  service's own vramAvgMb (populated only for a gpu-kind series). */
  vramAt?: (t: number, seed: number) => number;
}

function wobble(t: number, seed: number): number {
  return Math.sin(t / 41_000 + seed) * 0.5 + Math.sin(t / 13_000 + seed * 1.7) * 0.5;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

const CPU_APPS: readonly AppDef[] = [
  { name: 'chrome.exe', seed: 1, launchedMinutesAgo: 240, baseAt: (t, s) => clamp(6 + Math.abs(wobble(t, s)) * 10, 0, 100) },
  { name: 'Nexus', seed: 2, launchedMinutesAgo: 480, baseAt: (t, s) => clamp(3 + Math.abs(wobble(t, s)) * 4, 0, 100) },
  { name: 'Discord.exe', seed: 3, launchedMinutesAgo: 90, baseAt: (t, s) => clamp(2 + Math.abs(wobble(t, s)) * 3, 0, 100) },
  { name: 'explorer.exe', seed: 4, launchedMinutesAgo: 720, baseAt: (t, s) => clamp(1 + Math.abs(wobble(t, s)) * 2, 0, 100) },
  { name: 'Code.exe', seed: 5, launchedMinutesAgo: 15, baseAt: (t, s) => clamp(4 + Math.abs(wobble(t, s)) * 6, 0, 100) },
  { name: 'Spotify.exe', seed: 6, launchedMinutesAgo: 300, baseAt: (t, s) => clamp(1 + Math.abs(wobble(t, s)) * 2, 0, 100) },
];

const GPU_APPS: readonly AppDef[] = [
  {
    name: 'chrome.exe', seed: 11, launchedMinutesAgo: 240,
    baseAt: (t, s) => clamp(2 + Math.abs(wobble(t, s)) * 6, 0, 100),
    vramAt: (t, s) => clamp(300 + Math.abs(wobble(t, s)) * 200, 0, 24_000),
  },
  {
    name: 'Nexus', seed: 12, launchedMinutesAgo: 480,
    baseAt: (t, s) => clamp(1 + Math.abs(wobble(t, s)) * 3, 0, 100),
    vramAt: (t, s) => clamp(80 + Math.abs(wobble(t, s)) * 40, 0, 24_000),
  },
  {
    name: 'Code.exe', seed: 13, launchedMinutesAgo: 15,
    baseAt: (t, s) => clamp(0.5 + Math.abs(wobble(t, s)) * 2, 0, 100),
    vramAt: (t, s) => clamp(150 + Math.abs(wobble(t, s)) * 100, 0, 24_000),
  },
];

const MEMORY_APPS: readonly AppDef[] = [
  { name: 'chrome.exe', seed: 21, launchedMinutesAgo: 240, baseAt: (t, s) => clamp(800 + Math.abs(wobble(t, s)) * 400, 0, 16000) },
  { name: 'Nexus', seed: 22, launchedMinutesAgo: 480, baseAt: (t, s) => clamp(180 + Math.abs(wobble(t, s)) * 40, 0, 16000) },
  { name: 'Code.exe', seed: 23, launchedMinutesAgo: 15, baseAt: (t, s) => clamp(400 + Math.abs(wobble(t, s)) * 150, 0, 16000) },
  { name: 'Discord.exe', seed: 24, launchedMinutesAgo: 90, baseAt: (t, s) => clamp(250 + Math.abs(wobble(t, s)) * 80, 0, 16000) },
];

const NETWORK_APPS: readonly AppDef[] = [
  { name: 'chrome.exe', seed: 31, launchedMinutesAgo: 240, baseAt: (t, s) => Math.max(0, 40_000 + wobble(t, s) * 30_000) },
  { name: 'Discord.exe', seed: 32, launchedMinutesAgo: 90, baseAt: (t, s) => Math.max(0, 8_000 + wobble(t, s) * 6_000) },
  { name: 'Nexus', seed: 33, launchedMinutesAgo: 480, baseAt: (t, s) => Math.max(0, 1_000 + wobble(t, s) * 900) },
];

function defsFor(series: string): readonly AppDef[] {
  if (series === 'memory') return MEMORY_APPS;
  if (series === 'net') return NETWORK_APPS;
  if (series.startsWith('gpu')) return GPU_APPS;
  return CPU_APPS;
}

function pointsFor(def: AppDef, from: number, to: number, stepMs: number): AppWindowPoint[] {
  const points: AppWindowPoint[] = [];
  const firstSlot = Math.ceil(from / stepMs) * stepMs;
  for (let t = firstSlot; t <= to; t += stepMs) {
    points.push({ t, avg: Math.round(def.baseAt(t, def.seed) * 10) / 10 });
  }
  return points;
}

/** Window-average VRAM (MiB) for a GPU_APPS entry, mirroring the service's
 *  own vramAvgMb average-across-the-window - undefined for a def with no
 *  vramAt (every non-GPU app def). */
function vramAvgFor(def: AppDef, from: number, to: number, stepMs: number): number | undefined {
  if (!def.vramAt) return undefined;
  const values: number[] = [];
  const firstSlot = Math.ceil(from / stepMs) * stepMs;
  for (let t = firstSlot; t <= to; t += stepMs) values.push(def.vramAt(t, def.seed));
  if (values.length === 0) return undefined;
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
}

export function mockMonitoringHistoryApps(query: MetricHistoryAppsQuery): MetricHistoryAppsResponse {
  const from = Math.min(query.from, query.to);
  const to = Math.max(query.from, query.to);
  const maxApps = Math.max(1, Math.min(query.maxApps ?? DEFAULT_MAX_APPS, 50));
  const maxPoints = Math.max(2, Math.min(query.maxPoints ?? DEFAULT_MAX_POINTS, 2000));
  const windowMs = Math.max(1, to - from);
  const stepMs = Math.max(1000, Math.ceil(windowMs / maxPoints));

  const defs = defsFor(query.series);
  const apps: AppWindowSeries[] = defs.slice(0, maxApps).map(def => {
    const points = pointsFor(def, from, to, stepMs);
    const avgs = points.map(p => p.avg);
    const avg = avgs.length > 0 ? avgs.reduce((a, b) => a + b, 0) / avgs.length : 0;
    const max = avgs.length > 0 ? Math.max(...avgs) : 0;
    return {
      name: def.name,
      startedAtMs: to - def.launchedMinutesAgo * MINUTE_MS,
      avg: Math.round(avg * 10) / 10,
      max: Math.round(max * 10) / 10,
      vramAvgMb: vramAvgFor(def, from, to, stepMs),
      points,
    };
  }).sort((a, b) => b.avg - a.avg);

  return { supported: true, apps };
}
