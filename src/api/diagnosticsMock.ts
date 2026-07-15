// Contract-shaped fixtures for the diagnostics UI, used only as a dev-build
// fallback (see withMockFallback in diagnostics.ts) while the service routes
// in .deep-build/diagnostics-contract.md are still being built. Timestamps
// are fixed strings, not `new Date()`, so snapshots and screenshots stay
// deterministic across runs.
import type {
  CancelMemoryTestResponse,
  DiagnosticsCoolingResponse,
  DiagnosticsGpuResponse,
  DiagnosticsHealth,
  DiagnosticsIncidentsResponse,
  DiagnosticsMemoryResponse,
  DiagnosticsSmartResponse,
  DiagnosticsSystemResponse,
  DiagnosticsTemperatureAppBucket,
  DiagnosticsTemperatureAppsResponse,
  DiagnosticsTemperatureAppSlice,
  DiagnosticsTemperatureEpisode,
  DiagnosticsTemperaturePoint,
  DiagnosticsTemperatureQuery,
  DiagnosticsTemperatureSeries,
  DiagnosticsTemperaturesResponse,
  ScheduleMemoryTestResponse,
} from './diagnostics';

const GENERATED_AT = '2026-07-08T02:00:00Z';

const NVME_DRIVE_ID = 'storage:S6Z1NX0T123456';
const SATA_DRIVE_ID = 'storage:WD-WCC7K1234567';
const USB_DRIVE_ID = 'storage:4C530001180213108453';

export function mockDiagnosticsHealth(): DiagnosticsHealth {
  return {
    generatedAt: GENERATED_AT,
    supported: true,
    overall: 'watch',
    components: [
      {
        id: NVME_DRIVE_ID,
        kind: 'storage',
        name: 'Samsung SSD 990 PRO 2TB',
        status: 'ok',
        reasons: [],
      },
      {
        id: SATA_DRIVE_ID,
        kind: 'storage',
        name: 'WD Blue 4TB',
        status: 'watch',
        reasons: [
          {
            code: 'smart.reallocated',
            severity: 'watch',
            summary: '5 reallocated sectors',
            detail: 'SMART attribute 05 raw value is 5 and previously was 0.',
          },
        ],
      },
      {
        id: 'memory:aggregate',
        kind: 'memory',
        name: 'System Memory',
        status: 'ok',
        reasons: [],
      },
      {
        id: 'gpu:0',
        kind: 'gpu',
        name: 'NVIDIA GeForce RTX 3070',
        status: 'watch',
        reasons: [
          {
            code: 'gpu.thermalThrottle',
            severity: 'watch',
            summary: 'Thermal throttling active',
            detail: 'The GPU is currently limiting clocks due to temperature.',
          },
        ],
      },
      {
        id: 'cooling:hyte-q60:pump',
        kind: 'cooling',
        name: 'HYTE Q60 Pump',
        status: 'act',
        reasons: [
          {
            code: 'cooling.pumpStall',
            severity: 'act',
            summary: 'Pump RPM reads 0',
            detail: 'The pump has reported 0 RPM for more than 60 seconds.',
          },
        ],
      },
      {
        id: 'system:host',
        kind: 'system',
        name: 'System',
        status: 'ok',
        reasons: [],
      },
    ],
  };
}

export function mockDiagnosticsIncidents(): DiagnosticsIncidentsResponse {
  return {
    supported: true,
    windowDays: 30,
    incidents: [
      {
        id: 'System/39714',
        timeUtc: '2026-07-06T23:54:42Z',
        source: 'whea',
        severity: 'warning',
        title: 'Corrected PCIe hardware error',
        detail: 'WHEA-Logger event 17 reported a corrected hardware error on a PCIe root port.',
        app: null,
        data: { bugcheckCode: '' },
        repeatCount: 300,
        firstUtc: '2026-06-10T08:12:00Z',
      },
      {
        id: 'Application/8821',
        timeUtc: '2026-07-05T20:12:03Z',
        source: 'appCrash',
        severity: 'critical',
        title: 'Cyberpunk2077.exe crashed',
        detail: 'Exception code c0000005 in nvwgf2umx.dll.',
        app: {
          name: 'cyberpunk2077.exe',
          path: 'D:/SteamLibrary/steamapps/common/Cyberpunk 2077/bin/x64/Cyberpunk2077.exe',
          exceptionCode: 'c0000005',
          faultingModule: 'nvwgf2umx.dll',
          isGame: true,
        },
        data: {},
        repeatCount: 1,
        firstUtc: null,
      },
      {
        id: 'System/41003',
        timeUtc: '2026-07-04T09:03:11Z',
        source: 'dirtyShutdown',
        severity: 'warning',
        title: 'Unexpected shutdown',
        detail: 'The system did not shut down cleanly on the previous session.',
        app: null,
        data: {},
        repeatCount: 1,
        firstUtc: null,
      },
      {
        id: 'Application/6120',
        timeUtc: '2026-07-02T14:47:55Z',
        source: 'appCrash',
        severity: 'info',
        title: 'notepad.exe crashed',
        detail: 'Exception code c0000005 in ntdll.dll.',
        app: {
          name: 'notepad.exe',
          path: 'C:/Windows/System32/notepad.exe',
          exceptionCode: 'c0000005',
          faultingModule: 'ntdll.dll',
          isGame: false,
        },
        data: {},
        repeatCount: 1,
        firstUtc: null,
      },
      {
        id: 'System/12099',
        timeUtc: '2026-06-29T18:20:00Z',
        source: 'bugcheck',
        severity: 'critical',
        title: 'System crash (bugcheck 0x1a)',
        detail: 'The system restarted after a memory management bugcheck.',
        app: null,
        data: { bugcheckCode: '0x1a' },
        repeatCount: 1,
        firstUtc: null,
      },
    ],
  };
}

export function mockDiagnosticsSmart(): DiagnosticsSmartResponse {
  return {
    supported: true,
    drives: [
      {
        id: NVME_DRIVE_ID,
        name: 'Samsung SSD 990 PRO 2TB',
        serial: 'S6Z1NX0T123456',
        bus: 'nvme',
        sizeBytes: 2000398934016,
        temperatureC: 42,
        powerOnHours: 1234,
        powerCycles: 456,
        healthPercent: 97,
        status: 'good',
        statusReasons: [],
        attributes: [
          { id: 5, name: 'Reallocated Sectors Count', current: 100, worst: 100, threshold: 10, raw: 0, flagged: false },
          { id: 9, name: 'Power-On Hours', current: 99, worst: 99, threshold: 0, raw: 1234, flagged: false },
          { id: 12, name: 'Power Cycle Count', current: 99, worst: 99, threshold: 0, raw: 456, flagged: false },
        ],
        nvme: {
          criticalWarning: 0,
          availableSpare: 100,
          spareThreshold: 10,
          percentageUsed: 3,
          mediaErrors: 0,
          errorLogEntries: 0,
          unsafeShutdowns: 12,
          dataUnitsReadBytes: 512000000000,
          dataUnitsWrittenBytes: 780000000000,
        },
      },
      {
        id: SATA_DRIVE_ID,
        name: 'WD Blue 4TB',
        serial: 'WD-WCC7K1234567',
        bus: 'sata',
        sizeBytes: 4000787030016,
        temperatureC: 38,
        powerOnHours: 9820,
        powerCycles: 812,
        healthPercent: 82,
        status: 'caution',
        statusReasons: ['smart.reallocated'],
        attributes: [
          { id: 5, name: 'Reallocated Sectors Count', current: 90, worst: 90, threshold: 36, raw: 5, flagged: true },
          { id: 197, name: 'Current Pending Sector Count', current: 100, worst: 100, threshold: 0, raw: 0, flagged: false },
          { id: 9, name: 'Power-On Hours', current: 76, worst: 76, threshold: 0, raw: 9820, flagged: false },
        ],
        nvme: null,
      },
      // A drive without SMART support: the service returns early with only
      // id/name/serial/bus/sizeBytes set, so every reading is null. Do not
      // populate them.
      {
        id: USB_DRIVE_ID,
        name: 'SanDisk Ultra USB 3.0',
        serial: '4C530001180213108453',
        bus: 'usb',
        sizeBytes: 61530439680,
        temperatureC: null,
        powerOnHours: null,
        powerCycles: null,
        healthPercent: null,
        status: 'unknown',
        statusReasons: [],
        attributes: [],
        nvme: null,
      },
    ],
  };
}

export function mockDiagnosticsMemory(): DiagnosticsMemoryResponse {
  return {
    supported: true,
    modules: [
      { slot: 'DIMM_A1', sizeBytes: 17179869184, maxSpeedMts: 6000, configuredSpeedMts: 6000, manufacturer: 'Corsair', partNumber: 'CMK32GX5M2B6000C36' },
      // A pre-2.7 SMBIOS record, which has no configured-speed field, whose
      // Manufacturer/Part Number string indices are 0. Do not populate.
      { slot: 'DIMM_B1', sizeBytes: 17179869184, maxSpeedMts: 6000, configuredSpeedMts: null, manufacturer: null, partNumber: null },
    ],
    xmpLikelyActive: true,
    lastTest: null,
    testScheduled: mockMemoryTestScheduled,
  };
}

export function mockDiagnosticsGpu(): DiagnosticsGpuResponse {
  return {
    supported: true,
    gpus: [
      {
        name: 'NVIDIA GeForce RTX 3070',
        driverVersion: '591.86',
        temperatureC: 62,
        powerW: 180.5,
        throttle: {
          active: ['swThermal'],
          swPowerCapUs: 30224350,
          swThermalUs: 1658139360,
          hwThermalUs: 0,
          hwPowerBrakeUs: 0,
        },
        recentTdrCount: 0,
      },
    ],
  };
}

export function mockDiagnosticsCooling(): DiagnosticsCoolingResponse {
  return {
    supported: true,
    devices: [
      { id: 'cooling:hyte-q60:pump', name: 'HYTE Q60 Pump', type: 'pump', rpm: 0, targetDutyPercent: 60, status: 'stalled', sinceUtc: '2026-07-08T01:40:00Z' },
      { id: 'cooling:hyte-q60:fan1', name: 'HYTE Q60 Fan 1', type: 'fan', rpm: 1180, targetDutyPercent: 55, status: 'ok', sinceUtc: null },
      { id: 'cooling:hyte-q60:fan2', name: 'HYTE Q60 Fan 2', type: 'fan', rpm: 1190, targetDutyPercent: 55, status: 'ok', sinceUtc: null },
    ],
  };
}

// ── Temperature history ──────────────────────────────────────────────────
//
// Synthesizes 7 days of 5-minute-bucket samples (bucketMinutes matches the
// contract) ending at GENERATED_AT, then serves the caller's requested
// window from that fixed dataset - a 14d request still only returns the 7
// days the mock actually has, exercising the same "not enough history yet"
// shape the real service produces on a fresh install. A date query slices
// the same fixed dataset down to that single calendar day (UTC) instead of
// a rolling window; a date outside the 7 fabricated days comes back with an
// empty series, exercising the day picker's empty state. Deterministic (no
// Math.random) so screenshots and snapshots stay stable across runs.

const TEMP_BUCKET_MINUTES = 5;
const TEMP_BUCKET_MS = TEMP_BUCKET_MINUTES * 60_000;
const TEMP_HISTORY_DAYS = 7;
const TEMP_BUCKETS_PER_DAY = (24 * 60) / TEMP_BUCKET_MINUTES;
const TEMP_TOTAL_BUCKETS = TEMP_HISTORY_DAYS * TEMP_BUCKETS_PER_DAY;
const TEMP_MAX_POINTS = 600;
const GPU_SUSTAINED_THRESHOLD_C = 85;
// Matches the real service's retention window; the mock only fabricates
// TEMP_HISTORY_DAYS of actual samples within that window.
const TEMP_RETENTION_DAYS = 90;

/** Small deterministic wobble in [-1, 1], distinct per series via `seed`. */
function pseudoNoise(i: number, seed: number): number {
  return (((i * 37 + seed * 17) % 13) - 6) / 6;
}

function buildBucketSeries(baseline: number, dailyAmplitude: number, noiseAmplitude: number, seed: number): DiagnosticsTemperaturePoint[] {
  const endMs = new Date(GENERATED_AT).getTime();
  const points: DiagnosticsTemperaturePoint[] = [];
  for (let i = 0; i < TEMP_TOTAL_BUCKETS; i++) {
    const t = endMs - (TEMP_TOTAL_BUCKETS - 1 - i) * TEMP_BUCKET_MS;
    const daily = dailyAmplitude * Math.sin((i % TEMP_BUCKETS_PER_DAY) / TEMP_BUCKETS_PER_DAY * 2 * Math.PI - Math.PI / 2);
    const noise = noiseAmplitude * pseudoNoise(i, seed);
    const avg = Math.round((baseline + daily + noise) * 10) / 10;
    const max = Math.round((avg + 1 + Math.abs(pseudoNoise(i, seed + 5)) * 3) * 10) / 10;
    points.push({ t, avg, max });
  }
  return points;
}

/** Broad periodic usage-session bumps (gaming/compiling), on top of the daily cycle. */
function addUsageBumps(points: DiagnosticsTemperaturePoint[], amplitude: number, period: number, phase: number): void {
  for (let i = 0; i < points.length; i++) {
    const bump = Math.max(0, Math.sin(i / period + phase)) * amplitude;
    if (bump <= 0) continue;
    points[i] = { ...points[i], avg: Math.round((points[i].avg + bump) * 10) / 10, max: Math.round((points[i].max + bump) * 10) / 10 };
  }
}

/** Forces a short sustained-high run into the series (mirrors TemperatureInsights: 2+ consecutive buckets over threshold). */
function injectSustainedHighEpisode(points: DiagnosticsTemperaturePoint[], startIndex: number, peakAvgs: number[]): void {
  for (let j = 0; j < peakAvgs.length; j++) {
    const idx = startIndex + j;
    if (idx < 0 || idx >= points.length) continue;
    const avg = peakAvgs[j];
    points[idx] = { ...points[idx], avg, max: Math.round((avg + 2) * 10) / 10 };
  }
}

/** Removes a contiguous run of buckets so the chart has a real gap (line break) to render, e.g. the PC sleeping for an hour. */
function puncture(points: DiagnosticsTemperaturePoint[], startIndex: number, count: number): DiagnosticsTemperaturePoint[] {
  return [...points.slice(0, startIndex), ...points.slice(startIndex + count)];
}

/** Merges adjacent buckets (avg of avgs, max of maxes) down to at most maxPoints, matching the contract's server-side decimation. */
function decimate(points: DiagnosticsTemperaturePoint[], maxPoints: number): DiagnosticsTemperaturePoint[] {
  if (points.length <= maxPoints) return points;
  const groupSize = Math.ceil(points.length / maxPoints);
  const decimated: DiagnosticsTemperaturePoint[] = [];
  for (let i = 0; i < points.length; i += groupSize) {
    const chunk = points.slice(i, i + groupSize);
    const avg = Math.round((chunk.reduce((sum, p) => sum + p.avg, 0) / chunk.length) * 10) / 10;
    const max = Math.round(Math.max(...chunk.map(p => p.max)) * 10) / 10;
    decimated.push({ t: chunk[0].t, avg, max });
  }
  return decimated;
}

/** The last `hours` worth of buckets from a full 7-day series, capped to what the mock actually generated. */
function windowSeries(points: DiagnosticsTemperaturePoint[], hours: number): DiagnosticsTemperaturePoint[] {
  const cappedHours = Math.min(hours, TEMP_HISTORY_DAYS * 24);
  const numBuckets = Math.round((cappedHours * 60) / TEMP_BUCKET_MINUTES);
  return points.slice(-numBuckets);
}

// Falls within the 7d/14d range views but outside 24h/3d, so the episode
// only surfaces once the user widens the range enough to include it.
const GPU_EPISODE_DAY_OFFSET = 3;
const GPU_EPISODE_START_INDEX = TEMP_BUCKETS_PER_DAY * GPU_EPISODE_DAY_OFFSET + 170;
const GPU_EPISODE_PEAKS = [88, 91.5, 93, 92, 89.5, 86];

const cpuFullSeries = puncture(buildBucketSeries(46, 6, 3, 1), 500, 12);
addUsageBumps(cpuFullSeries, 14, 40, 0.4);

const gpuFullSeries = buildBucketSeries(40, 4, 2.5, 2);
addUsageBumps(gpuFullSeries, 24, 55, 1.3);
injectSustainedHighEpisode(gpuFullSeries, GPU_EPISODE_START_INDEX, GPU_EPISODE_PEAKS);

const storageFullSeries = buildBucketSeries(36, 2, 2, 3);

function findSustainedHighEpisodes(points: DiagnosticsTemperaturePoint[], componentId: string, name: string, thresholdC: number): DiagnosticsTemperatureEpisode[] {
  const episodes: DiagnosticsTemperatureEpisode[] = [];
  let runStart = -1;
  for (let i = 0; i <= points.length; i++) {
    const over = i < points.length && points[i].avg >= thresholdC;
    if (over && runStart === -1) runStart = i;
    if (!over && runStart !== -1) {
      const run = points.slice(runStart, i);
      if (run.length >= 2) {
        episodes.push({
          componentId,
          name,
          startUtc: new Date(run[0].t).toISOString(),
          endUtc: new Date(run[run.length - 1].t + TEMP_BUCKET_MS).toISOString(),
          peakC: Math.max(...run.map(p => p.avg)),
          thresholdC,
        });
      }
      runStart = -1;
    }
  }
  return episodes;
}

/** Points whose timestamp falls within the UTC calendar day `date` (YYYY-MM-DD). */
function pointsForDate(points: DiagnosticsTemperaturePoint[], date: string): DiagnosticsTemperaturePoint[] {
  const startMs = new Date(`${date}T00:00:00.000Z`).getTime();
  const endMs = startMs + 24 * 60 * 60 * 1000;
  return points.filter(p => p.t >= startMs && p.t < endMs);
}

function mockDiagnosticsTemperaturesForDate(date: string): DiagnosticsTemperaturesResponse {
  const cpuPoints = pointsForDate(cpuFullSeries, date);
  const gpuPoints = pointsForDate(gpuFullSeries, date);
  const storagePoints = pointsForDate(storageFullSeries, date);
  if (cpuPoints.length === 0 && gpuPoints.length === 0 && storagePoints.length === 0) {
    return { supported: true, bucketMinutes: TEMP_BUCKET_MINUTES, retentionDays: TEMP_RETENTION_DAYS, series: [], episodes: [] };
  }
  const series: DiagnosticsTemperatureSeries[] = [
    { id: 'cpu', kind: 'cpu', name: 'AMD Ryzen 7 9800X3D', points: cpuPoints },
    { id: 'gpu:0', kind: 'gpu', name: 'NVIDIA GeForce RTX 3070', points: gpuPoints },
    { id: NVME_DRIVE_ID, kind: 'storage', name: 'Samsung SSD 990 PRO 2TB', points: storagePoints },
  ];
  const episodes = findSustainedHighEpisodes(gpuPoints, 'gpu:0', 'NVIDIA GeForce RTX 3070', GPU_SUSTAINED_THRESHOLD_C);
  return { supported: true, bucketMinutes: TEMP_BUCKET_MINUTES, retentionDays: TEMP_RETENTION_DAYS, series, episodes };
}

export function mockDiagnosticsTemperatures(query: DiagnosticsTemperatureQuery): DiagnosticsTemperaturesResponse {
  if ('date' in query) return mockDiagnosticsTemperaturesForDate(query.date);
  const hours = query.hours;
  const series: DiagnosticsTemperatureSeries[] = [
    { id: 'cpu', kind: 'cpu', name: 'AMD Ryzen 7 9800X3D', points: decimate(windowSeries(cpuFullSeries, hours), TEMP_MAX_POINTS) },
    { id: 'gpu:0', kind: 'gpu', name: 'NVIDIA GeForce RTX 3070', points: decimate(windowSeries(gpuFullSeries, hours), TEMP_MAX_POINTS) },
    { id: NVME_DRIVE_ID, kind: 'storage', name: 'Samsung SSD 990 PRO 2TB', points: decimate(windowSeries(storageFullSeries, hours), TEMP_MAX_POINTS) },
  ];
  const episodes = findSustainedHighEpisodes(windowSeries(gpuFullSeries, hours), 'gpu:0', 'NVIDIA GeForce RTX 3070', GPU_SUSTAINED_THRESHOLD_C);
  return { supported: true, bucketMinutes: TEMP_BUCKET_MINUTES, retentionDays: TEMP_RETENTION_DAYS, series, episodes };
}

// ── Temperature history: hover app breakdown ────────────────────────────
//
// Synthesizes the same TEMP_HISTORY_DAYS window as the temperature series
// above (ending at GENERATED_AT), in fixed APP_BUCKET_MINUTES buckets keyed
// by slot start. Every third bucket is idle (omitted) so the empty-hover
// case is exercised; the rest cycle deterministically through APP_NAMES.

const APP_NAMES = ['Google Chrome', 'Visual Studio Code', 'Steam', 'Slack'] as const;
const APP_BUCKET_MINUTES = 30;
const APP_BUCKET_MS = APP_BUCKET_MINUTES * 60_000;

function buildAppBuckets(): DiagnosticsTemperatureAppBucket[] {
  const endMs = new Date(GENERATED_AT).getTime();
  const startMs = endMs - TEMP_HISTORY_DAYS * 24 * 60 * 60 * 1000;
  const buckets: DiagnosticsTemperatureAppBucket[] = [];
  let i = 0;
  for (let t = startMs; t < endMs; t += APP_BUCKET_MS, i++) {
    if (i % 3 === 2) continue;
    const primary: DiagnosticsTemperatureAppSlice = {
      appName: APP_NAMES[i % APP_NAMES.length], appId: APP_NAMES[i % APP_NAMES.length],
      ms: (12 + (i % 5) * 3) * 60_000,
    };
    const apps = [primary];
    if (i % 4 === 0) {
      const secondaryName = APP_NAMES[(i + 1) % APP_NAMES.length];
      apps.push({ appName: secondaryName, appId: secondaryName, ms: 5 * 60_000 });
    }
    buckets.push({ startUtcMs: t, apps: apps.sort((a, b) => b.ms - a.ms) });
  }
  return buckets;
}

const appBucketsFullHistory = buildAppBuckets();

function appBucketsInWindow(startMs: number, endMs: number): DiagnosticsTemperatureAppBucket[] {
  return appBucketsFullHistory.filter(b => b.startUtcMs >= startMs && b.startUtcMs < endMs);
}

export function mockDiagnosticsTemperatureApps(query: DiagnosticsTemperatureQuery): DiagnosticsTemperatureAppsResponse {
  const endMs = new Date(GENERATED_AT).getTime();
  if ('date' in query) {
    const startMs = new Date(`${query.date}T00:00:00.000Z`).getTime();
    return { supported: true, bucketMinutes: APP_BUCKET_MINUTES, buckets: appBucketsInWindow(startMs, startMs + 24 * 60 * 60 * 1000) };
  }
  const cappedHours = Math.min(query.hours, TEMP_HISTORY_DAYS * 24);
  return { supported: true, bucketMinutes: APP_BUCKET_MINUTES, buckets: appBucketsInWindow(endMs - cappedHours * 60 * 60 * 1000, endMs) };
}

export function mockDiagnosticsSystem(): DiagnosticsSystemResponse {
  return {
    supported: true,
    pnpProblems: [
      { name: 'Unknown USB Device', deviceId: 'USB\\VID_0000&PID_0002\\5&1a2b3c4d&0&1', problemCode: 28, problemText: 'CM_PROB_FAILED_INSTALL' },
      { name: '', deviceId: 'ACPI\\PNP0C0D\\1', problemCode: 99, problemText: 'CM_PROB_UNKNOWN' },
    ],
    counts30d: {
      whea: 20,
      bugchecks: 1,
      dirtyShutdowns: 3,
      diskErrors: 0,
      tdrs: 0,
      appCrashes: 5,
    },
  };
}

// The GET /diagnostics/memory mock reads this so a mocked schedule/cancel
// round-trip is reflected on the next refetch, matching the real service's
// persisted-flag behavior closely enough to exercise the confirm/cancel UI.
let mockMemoryTestScheduled = false;

export function mockScheduleMemoryTest(): ScheduleMemoryTestResponse {
  mockMemoryTestScheduled = true;
  return { scheduled: true, requiresReboot: true };
}

export function mockCancelMemoryTest(): CancelMemoryTestResponse {
  mockMemoryTestScheduled = false;
  return { scheduled: false };
}
