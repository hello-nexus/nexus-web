// Contract-shaped fixture for GET /monitoring/history, used only as a dev-
// build fallback (see withMockFallback-equivalent gate in monitoringHistory.ts)
// while the service route is still being built. Every series is a pure
// function of the requested timestamp `t` (no fixed anchor date, no
// Math.random), so a query for "now" always returns plausible fresh data and
// the live-tail poll sees new points as real time advances.

import type { MetricHistoryKind, MetricHistoryPoint, MetricHistoryQuery, MetricHistoryResponse, MetricHistorySeries } from './monitoringHistory';

const DAY_MS = 86_400_000;
const DEFAULT_MAX_POINTS = 600;
const RETENTION_DAYS = 7;

// Mirrors the pinned contract's decimation ladder: the first step whose
// bucket count fits within the requested maxPoints.
const STEP_LADDER_SECONDS = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600] as const;

function pickStepSeconds(windowMs: number, maxPoints: number): number {
  const minStep = Math.ceil(windowMs / 1000 / Math.max(1, maxPoints));
  return STEP_LADDER_SECONDS.find(s => s >= minStep) ?? STEP_LADDER_SECONDS[STEP_LADDER_SECONDS.length - 1];
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** Deterministic, seed-varied wobble in roughly [-1, 1] - a cheap stand-in
 *  for sensor noise that stays a pure function of t. */
function wobble(t: number, seed: number): number {
  return Math.sin(t / 53_000 + seed) * 0.6 + Math.sin(t / 17_000 + seed * 2.1) * 0.4;
}

/** A slow, occasional usage-session bump (gaming/downloading/compiling). */
function sessionBump(t: number, periodMs: number, phase: number): number {
  return Math.max(0, Math.sin(t / periodMs + phase));
}

function dayPhase(t: number): number {
  return ((t % DAY_MS) / DAY_MS) * 2 * Math.PI - Math.PI / 2;
}

function roundForKind(kind: MetricHistoryKind, v: number): number {
  return kind === 'net' || kind === 'fan' ? Math.round(v) : Math.round(v * 10) / 10;
}

interface SeriesDef {
  id: string;
  kind: MetricHistoryKind;
  name: string;
  adapterLuid?: string;
  avgAt: (t: number) => number;
  spreadAt: (t: number) => number;
}

const CPU_LOAD_BUMP_PHASE = 0.4;
const GPU_LOAD_BUMP_PHASE = 0.7;

const SERIES_DEFS: readonly SeriesDef[] = [
  {
    id: 'cpu', kind: 'cpu', name: 'CPU',
    avgAt: t => clamp(28 + 16 * Math.sin(dayPhase(t)) + wobble(t, 1) * 12 + sessionBump(t, 2_400_000, CPU_LOAD_BUMP_PHASE) * 35, 1, 100),
    spreadAt: t => 3 + Math.abs(wobble(t, 11)) * 4,
  },
  {
    id: 'memory', kind: 'memory', name: 'Memory',
    avgAt: t => clamp(55 + 6 * Math.sin(dayPhase(t) * 0.5) + wobble(t, 2) * 5, 10, 95),
    spreadAt: t => 1 + Math.abs(wobble(t, 12)) * 2,
  },
  {
    id: 'net-in', kind: 'net', name: 'Download',
    avgAt: t => Math.max(0, 150_000 + sessionBump(t, 1_800_000, 1.1) * 3_000_000 + wobble(t, 3) * 300_000),
    spreadAt: t => 20_000 + Math.abs(wobble(t, 13)) * 200_000,
  },
  {
    id: 'net-out', kind: 'net', name: 'Upload',
    avgAt: t => Math.max(0, 40_000 + sessionBump(t, 2_100_000, 2.2) * 800_000 + wobble(t, 4) * 80_000),
    spreadAt: t => 5_000 + Math.abs(wobble(t, 14)) * 60_000,
  },
  {
    id: 'gpu:0', kind: 'gpu', name: 'NVIDIA GeForce RTX 3070', adapterLuid: '0:12345',
    avgAt: t => clamp(12 + sessionBump(t, 2_000_000, GPU_LOAD_BUMP_PHASE) * 70 + wobble(t, 5) * 10, 0, 100),
    spreadAt: t => 2 + Math.abs(wobble(t, 15)) * 4,
  },
  {
    id: 'cpu-temp', kind: 'cpu-temp', name: 'CPU',
    avgAt: t => clamp(42 + sessionBump(t, 2_400_000, CPU_LOAD_BUMP_PHASE) * 30 + wobble(t, 7) * 4, 28, 88),
    spreadAt: t => 1 + Math.abs(wobble(t, 17)) * 2,
  },
  {
    id: 'gpu-temp:0', kind: 'gpu-temp', name: 'NVIDIA GeForce RTX 3070', adapterLuid: '0:12345',
    avgAt: t => clamp(40 + sessionBump(t, 2_000_000, GPU_LOAD_BUMP_PHASE) * 35 + wobble(t, 6) * 4, 30, 92),
    spreadAt: t => 1 + Math.abs(wobble(t, 16)) * 2,
  },
  {
    id: 'mem-temp', kind: 'mem-temp', name: 'Memory',
    avgAt: t => clamp(38 + sessionBump(t, 2_400_000, CPU_LOAD_BUMP_PHASE) * 8 + wobble(t, 8) * 3, 30, 60),
    spreadAt: t => 1 + Math.abs(wobble(t, 18)) * 1.5,
  },
  {
    id: 'drive-temp:0', kind: 'drive-temp', name: 'Samsung SSD 990 PRO 2TB',
    avgAt: t => clamp(34 + sessionBump(t, 2_400_000, CPU_LOAD_BUMP_PHASE) * 10 + wobble(t, 9) * 3, 25, 65),
    spreadAt: t => 1 + Math.abs(wobble(t, 19)) * 2,
  },
  {
    id: 'drive-temp:1', kind: 'drive-temp', name: 'WD Black SN850X 1TB',
    avgAt: t => clamp(32 + sessionBump(t, 2_400_000, CPU_LOAD_BUMP_PHASE) * 8 + wobble(t, 10) * 3, 25, 60),
    spreadAt: t => 1 + Math.abs(wobble(t, 20)) * 2,
  },
  {
    id: 'fan:1', kind: 'fan', name: 'Fan 1',
    avgAt: t => clamp(400 + sessionBump(t, 2_400_000, CPU_LOAD_BUMP_PHASE) * 1400 + wobble(t, 21) * 60, 200, 2200),
    spreadAt: t => 20 + Math.abs(wobble(t, 31)) * 40,
  },
  {
    id: 'fan:2', kind: 'fan', name: 'Fan 2',
    avgAt: t => clamp(380 + sessionBump(t, 2_400_000, CPU_LOAD_BUMP_PHASE) * 1350 + wobble(t, 22) * 60, 200, 2200),
    spreadAt: t => 20 + Math.abs(wobble(t, 32)) * 40,
  },
];

function matchesFilter(def: SeriesDef, tokens: readonly string[] | null): boolean {
  if (!tokens) return true;
  return tokens.includes(def.id) || tokens.includes(def.kind);
}

function pointsFor(def: SeriesDef, from: number, to: number, stepMs: number): MetricHistoryPoint[] {
  const points: MetricHistoryPoint[] = [];
  const firstSlot = Math.ceil(from / stepMs) * stepMs;
  for (let t = firstSlot; t <= to; t += stepMs) {
    const avg = def.avgAt(t);
    const max = avg + def.spreadAt(t);
    points.push({ t, avg: roundForKind(def.kind, avg), max: roundForKind(def.kind, max) });
  }
  return points;
}

export function mockMonitoringHistory(query: MetricHistoryQuery): MetricHistoryResponse {
  const from = Math.min(query.from, query.to);
  const to = Math.max(query.from, query.to);
  const maxPoints = clamp(query.maxPoints ?? DEFAULT_MAX_POINTS, 1, 2000);
  const stepSeconds = pickStepSeconds(to - from, maxPoints);
  const stepMs = stepSeconds * 1000;
  const tokens = query.series ? query.series.split(',').map(s => s.trim()).filter(Boolean) : null;

  const series: MetricHistorySeries[] = SERIES_DEFS
    .filter(def => matchesFilter(def, tokens))
    .map(def => ({
      id: def.id,
      kind: def.kind,
      name: def.name,
      adapterLuid: def.adapterLuid,
      points: pointsFor(def, from, to, stepMs),
    }));

  return { supported: true, retentionDays: RETENTION_DAYS, stepSeconds, series };
}
