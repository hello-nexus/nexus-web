import type { MonitoringFrame } from '../hooks/useMonitoringFrame';
import type { SeriesEntry } from '../hooks/useProcessMonitor';
import type { NetworkEntry } from '../hooks/useNetworkMonitor';

const MAX_SAMPLES = 60;
const TOP_PROCS = 20;

const SERIES_COLORS = [
  '#8b5cf6', '#f472b6', '#22d3ee', '#10b981', '#f59e0b',
  '#ef4444', '#6366f1', '#ec4899', '#14b8a6', '#f97316',
  '#a78bfa', '#fb923c', '#34d399', '#f87171', '#38bdf8',
  '#c084fc', '#fbbf24', '#2dd4bf', '#e879f9', '#818cf8',
];
const OTHER_COLOR = '#3a3a4f';

// Global name → color map: every app/process gets one consistent color
// across CPU, Memory, Network, and Screen Time charts.
const nameColors = new Map<string, string>();
let colorIdx = 0;

function colorFor(name: string): string {
  let c = nameColors.get(name);
  if (!c) {
    c = SERIES_COLORS[colorIdx++ % SERIES_COLORS.length];
    nameColors.set(name, c);
  }
  return c;
}

export { SERIES_COLORS, OTHER_COLOR, colorFor };

// ── Process history ──────────────────────────────────────────────────────

const cpuHist = new Map<string, { color: string; values: number[] }>();
const memHist = new Map<string, { color: string; values: number[] }>();
let otherCpuHist: number[] = [];
let otherMemHist: number[] = [];
let systemMemMb = 0;

// ── Network history ──────────────────────────────────────────────────────

const netHist = new Map<string, { color: string; values: number[] }>();

// ── Overview sparklines ──────────────────────────────────────────────────

const overviewHist = {
  cpu: [] as number[],
  gpu: [] as number[],
  mem: [] as number[],
  netDown: [] as number[],
  netUp: [] as number[],
};

// ── Per-sensor history (panel performance widget) ────────────────────────
//
// Singleton 60-sample ring buffers keyed by `${device}::${sensorName}`.
// PerfSlot in the panel performance widget reads from this so the same
// sensor's history is shared across the tile + immersive views (no
// reset on tap-to-immersive). Buffers grow on every pushPanelSensorSample
// call - if no caller ever pushes, the map stays empty (no allocations).

const panelSensorHist = new Map<string, number[]>();

export function pushPanelSensorSample(key: string, value: number) {
  // CRITICAL: produce a NEW array reference each push. Sparkline +
  // other gauge consumers useMemo on [values, ...] - mutating the same
  // array in place leaves the reference unchanged and the memoized
  // chart never recomputes (the canonical "monitoringStore mutates
  // in place; never memo on consumers" footgun). Allocating a fresh
  // array per push keeps the reference fresh and is cheap at 60-sample
  // buffers.
  const prev = panelSensorHist.get(key) ?? EMPTY_HIST;
  const next = prev.length >= MAX_SAMPLES
    ? prev.slice(prev.length - MAX_SAMPLES + 1).concat(value)
    : [...prev, value];
  panelSensorHist.set(key, next);
  notify();
}

export function getPanelSensorHist(key: string): readonly number[] {
  return panelSensorHist.get(key) ?? EMPTY_HIST;
}

const EMPTY_HIST: readonly number[] = [];

// ── Screen time ──────────────────────────────────────────────────────────

interface FocusSession {
  id: string;
  name: string;
  today: { total: number; hours: number; minutes: number; seconds: number };
}

interface AppUsage {
  name: string;
  totalMs: number;
}

let stFocus: FocusSession | null = null;
let stHistory: AppUsage[] = [];

// ── Latest frame ─────────────────────────────────────────────────────────

let latestFrame: MonitoringFrame | null = null;

// ── Listeners ────────────────────────────────────────────────────────────

const listeners = new Set<() => void>();

function notify() {
  for (const fn of listeners) fn();
}

export function subscribe(fn: () => void) { listeners.add(fn); }
export function unsubscribe(fn: () => void) { listeners.delete(fn); }

// ── Ingest ───────────────────────────────────────────────────────────────

export function setSystemMemMb(mb: number) { systemMemMb = mb; }

let ingestCount = 0;

function pruneColors() {
  for (const name of nameColors.keys()) {
    if (!cpuHist.has(name) && !memHist.has(name) && !netHist.has(name)) {
      nameColors.delete(name);
    }
  }
}

export function ingestMonitoring(frame: MonitoringFrame) {
  latestFrame = frame;

  // Overview sparklines
  const procs = frame.processes;
  const net = frame.network;
  const gpuSensors = frame.gpu?.[0]?.sensors ?? [];
  const gpuLoad = gpuSensors.find(s => s.id.includes('load'));
  push60(overviewHist.cpu, procs?.totalCpu ?? 0);
  push60(overviewHist.gpu, gpuLoad?.value ?? 0);
  push60(overviewHist.mem, procs?.processes.reduce((s, p) => s + p.memoryMb, 0) ?? 0);
  push60(overviewHist.netDown, net?.entries.reduce((s, e) => s + e.rateIn, 0) ?? 0);
  push60(overviewHist.netUp, net?.entries.reduce((s, e) => s + e.rateOut, 0) ?? 0);

  // Process history — aggregate by name first so duplicate process names
  // (Windows doesn't group by name like macOS) push exactly one value per frame.
  if (procs && procs.processes.length > 0) {
    const grouped = new Map<string, { cpu: number; mem: number }>();
    for (const p of procs.processes) {
      const existing = grouped.get(p.name);
      if (existing) {
        existing.cpu += p.cpuPercent;
        existing.mem += p.memoryMb;
      } else {
        grouped.set(p.name, { cpu: p.cpuPercent, mem: p.memoryMb });
      }
    }

    let topCpuSum = 0;
    for (const [name, { cpu, mem }] of grouped) {
      topCpuSum += cpu;
      pushHist(cpuHist, name, cpu);
      pushHist(memHist, name, mem);
    }

    for (const [, entry] of cpuHist) {
      if (entry.values.length < maxLen(cpuHist)) entry.values.push(0);
      trimArr(entry);
    }
    for (const [, entry] of memHist) {
      if (entry.values.length < maxLen(memHist)) entry.values.push(0);
      trimArr(entry);
    }

    otherCpuHist.push(Math.round(Math.max(0, procs.totalCpu - topCpuSum) * 10) / 10);
    if (otherCpuHist.length > MAX_SAMPLES) otherCpuHist = otherCpuHist.slice(-MAX_SAMPLES);

    const topMemSum = procs.processes.reduce((s, p) => s + p.memoryMb, 0);
    const totalUsedMb = systemMemMb > 0 ? (procs.totalMemoryPercent / 100) * systemMemMb : topMemSum;
    otherMemHist.push(Math.round(Math.max(0, totalUsedMb - topMemSum)));
    if (otherMemHist.length > MAX_SAMPLES) otherMemHist = otherMemHist.slice(-MAX_SAMPLES);
  }

  // Network history — per-process
  if (net && net.entries) {
    const seen = new Set<string>();
    for (const e of net.entries) {
      seen.add(e.name);
      const rateKBs = (e.rateIn + e.rateOut) / 1024;
      pushHist(netHist, e.name, rateKBs);
    }
    for (const [, entry] of netHist) {
      if (entry.values.length < maxLen(netHist)) entry.values.push(0);
      trimArr(entry);
    }
  }

  if (++ingestCount % 60 === 0) pruneColors();

  notify();
}

export function ingestScreenTime(frame: { focus: FocusSession | null; history: AppUsage[] }) {
  stFocus = frame.focus?.name ? frame.focus : null;
  stHistory = frame.history ?? [];
  notify();
}

// ── Getters ──────────────────────────────────────────────────────────────

export function getMonitoringFrame() { return latestFrame; }
export function getOverviewHist() { return overviewHist; }

export function getProcessData() {
  const procs = latestFrame?.processes;
  const cpuSeries = buildSeries(cpuHist, procs?.processes ?? [], 'cpuPercent', TOP_PROCS);

  const otherVals = padLeft(otherCpuHist);
  const otherAvg = otherCpuHist.length > 0
    ? otherCpuHist.reduce((a, b) => a + b, 0) / otherCpuHist.length : 0;
  cpuSeries.push({
    name: 'Other', color: OTHER_COLOR, values: otherVals,
    current: otherCpuHist[otherCpuHist.length - 1] ?? 0,
    avg: Math.round(otherAvg * 10) / 10,
  });

  const memSeries = buildSeries(memHist, procs?.processes ?? [], 'memoryMb', TOP_PROCS);

  const otherMemVals = padLeft(otherMemHist);
  const otherMemAvg = otherMemHist.length > 0
    ? otherMemHist.reduce((a, b) => a + b, 0) / otherMemHist.length : 0;
  memSeries.push({
    name: 'Other', color: OTHER_COLOR, values: otherMemVals,
    current: otherMemHist[otherMemHist.length - 1] ?? 0,
    avg: Math.round(otherMemAvg),
  });

  return {
    cpuSeries, memSeries,
    sampleCount: MAX_SAMPLES,
    totalCpu: procs?.totalCpu ?? 0,
    totalMemMb: procs?.processes.reduce((s, p) => s + p.memoryMb, 0) ?? 0,
    systemMemMb,
  };
}

export function getNetworkData() {
  const net = latestFrame?.network;
  const entries = net?.entries ?? [];
  const TOP_NET = 15;

  const allSeries: SeriesEntry[] = [];
  for (const [name, entry] of netHist) {
    const vals = entry.values;
    const sum = vals.reduce((a, b) => a + b, 0);
    const avg = vals.length > 0 ? sum / vals.length : 0;
    if (avg < 0.01 && vals[vals.length - 1] === 0) continue;
    const e = entries.find(x => x.name === name);
    allSeries.push({
      name, color: entry.color,
      values: padLeft(vals),
      current: e ? (e.rateIn + e.rateOut) / 1024 : 0,
      avg: Math.round(avg * 10) / 10,
    });
  }
  allSeries.sort((a, b) => b.avg - a.avg);
  const series = allSeries.slice(0, TOP_NET);

  let totalRate = 0, totalRateIn = 0, totalRateOut = 0;
  const netEntries: NetworkEntry[] = [];
  for (const e of entries) {
    const rateTotal = e.rateIn + e.rateOut;
    if (rateTotal > 0) {
      netEntries.push({
        name: e.name,
        color: colorFor(e.name),
        rateIn: e.rateIn, rateOut: e.rateOut, rateTotal,
      });
      totalRate += rateTotal;
      totalRateIn += e.rateIn;
      totalRateOut += e.rateOut;
    }
  }
  netEntries.sort((a, b) => b.rateTotal - a.rateTotal);

  return { series, sampleCount: MAX_SAMPLES, totalRate, totalRateIn, totalRateOut, entries: netEntries };
}

export function getScreenTime() {
  return { focus: stFocus, history: stHistory };
}

// ── Helpers ──────────────────────────────────────────────────────────────

function push60(arr: number[], val: number) {
  arr.push(val);
  if (arr.length > MAX_SAMPLES) arr.splice(0, arr.length - MAX_SAMPLES);
}

function pushHist(
  map: Map<string, { color: string; values: number[] }>,
  name: string, val: number,
) {
  let entry = map.get(name);
  if (!entry) {
    entry = { color: colorFor(name), values: [] };
    map.set(name, entry);
  }
  entry.values.push(val);
}

function trimArr(entry: { values: number[] }) {
  if (entry.values.length > MAX_SAMPLES)
    entry.values = entry.values.slice(-MAX_SAMPLES);
}

function maxLen(map: Map<string, { values: number[] }>): number {
  let m = 0;
  for (const [, e] of map) if (e.values.length > m) m = e.values.length;
  return m;
}

function padLeft(arr: number[]): number[] {
  if (arr.length >= MAX_SAMPLES) return arr.slice(-MAX_SAMPLES);
  const out = new Array<number>(MAX_SAMPLES);
  const pad = MAX_SAMPLES - arr.length;
  for (let i = 0; i < pad; i++) out[i] = 0;
  for (let i = 0; i < arr.length; i++) out[pad + i] = arr[i];
  return out;
}

function buildSeries(
  map: Map<string, { color: string; values: number[] }>,
  procs: Array<{ name: string; cpuPercent: number; memoryMb: number }>,
  field: 'cpuPercent' | 'memoryMb',
  topN: number,
): SeriesEntry[] {
  const result: SeriesEntry[] = [];
  for (const [name, entry] of map) {
    const vals = entry.values;
    const sum = vals.reduce((a, b) => a + b, 0);
    const avg = vals.length > 0 ? sum / vals.length : 0;
    if (avg < 0.01 && vals[vals.length - 1] === 0) continue;
    const latest = procs.find(p => p.name === name);
    result.push({
      name, color: entry.color,
      values: padLeft(vals),
      current: latest?.[field] ?? 0,
      avg: Math.round(avg * 10) / 10,
    });
  }
  result.sort((a, b) => b.avg - a.avg);
  return result.slice(0, topN);
}
