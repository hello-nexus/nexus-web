// Diagnostics API client - typed wrapper over the local service's
// /diagnostics/* routes (contract: .deep-build/diagnostics-contract.md).
// The service routes don't exist yet, so every fetch here falls back to
// contract-shaped mock data in dev builds when the real call fails (see
// withMockFallback). DEV_TOOLS is statically false in production, so the
// mock branch (and the mock module it imports) dead-code-eliminates out of
// release bundles.

import { deleteService, fetchService, fetchServiceBlob, postService } from './service';
import { DEV_TOOLS } from '../lib/devTools';
import * as mock from './diagnosticsMock';

export type DiagnosticsStatus = 'ok' | 'watch' | 'act' | 'unknown';
export type DiagnosticsKind = 'storage' | 'memory' | 'gpu' | 'cooling' | 'system';

export interface DiagnosticsReason {
  code: string;
  severity: DiagnosticsStatus;
  summary: string;
  detail: string;
}

export interface DiagnosticsComponent {
  id: string;
  kind: DiagnosticsKind;
  name: string;
  status: DiagnosticsStatus;
  reasons: DiagnosticsReason[];
}

export interface DiagnosticsHealth {
  generatedAt: string;
  supported: boolean;
  overall: DiagnosticsStatus;
  components: DiagnosticsComponent[];
}

export type DiagnosticsIncidentSource =
  | 'whea' | 'bugcheck' | 'dirtyShutdown' | 'disk' | 'tdr'
  | 'gpuDriver' | 'appCrash' | 'liveKernel' | 'memDiag';

export type DiagnosticsIncidentSeverity = 'info' | 'warning' | 'critical';

export interface DiagnosticsIncidentApp {
  name: string;
  path: string;
  exceptionCode: string;
  faultingModule: string;
  isGame: boolean;
}

export interface DiagnosticsIncident {
  id: string;
  timeUtc: string;
  source: DiagnosticsIncidentSource;
  severity: DiagnosticsIncidentSeverity;
  title: string;
  detail: string;
  app: DiagnosticsIncidentApp | null;
  data: Record<string, string>;
}

export interface DiagnosticsIncidentsResponse {
  supported: boolean;
  windowDays: number;
  incidents: DiagnosticsIncident[];
}

export type DiagnosticsDriveBus = 'nvme' | 'sata' | 'usb' | 'raid' | 'other';
export type DiagnosticsDriveStatus = 'good' | 'caution' | 'warning' | 'bad' | 'unknown';

export interface SmartAttribute {
  id: number;
  name: string;
  current: number;
  worst: number;
  threshold: number;
  raw: number;
  flagged: boolean;
}

export interface NvmeHealth {
  criticalWarning: number;
  availableSpare: number;
  spareThreshold: number;
  percentageUsed: number;
  mediaErrors: number;
  errorLogEntries: number;
  unsafeShutdowns: number;
  dataUnitsReadBytes: number;
  dataUnitsWrittenBytes: number;
}

export interface DiagnosticsDrive {
  id: string;
  name: string;
  serial: string;
  bus: DiagnosticsDriveBus;
  sizeBytes: number;
  temperatureC: number | null;
  powerOnHours: number;
  powerCycles: number;
  healthPercent: number | null;
  status: DiagnosticsDriveStatus;
  statusReasons: string[];
  attributes: SmartAttribute[];
  nvme: NvmeHealth | null;
}

export interface DiagnosticsSmartResponse {
  supported: boolean;
  drives: DiagnosticsDrive[];
}

export interface MemoryModule {
  slot: string;
  sizeBytes: number;
  maxSpeedMts: number;
  configuredSpeedMts: number;
  manufacturer: string;
  partNumber: string;
}

export type MemoryTestResultValue = 'passed' | 'failed' | 'unknown';

export interface MemoryTestResult {
  timeUtc: string;
  result: MemoryTestResultValue;
  detail: string;
}

export interface DiagnosticsMemoryResponse {
  supported: boolean;
  modules: MemoryModule[];
  xmpLikelyActive: boolean | null;
  lastTest: MemoryTestResult | null;
  testScheduled: boolean;
}

export interface ScheduleMemoryTestResponse {
  scheduled: boolean;
  requiresReboot: boolean;
}

export interface CancelMemoryTestResponse {
  scheduled: boolean;
}

export type GpuThrottleReason = 'swPower' | 'hwSlowdown' | 'hwThermal' | 'hwPowerBrake' | 'swThermal' | 'other';

export interface GpuThrottle {
  active: GpuThrottleReason[];
  swPowerCapUs: number;
  swThermalUs: number;
  hwThermalUs: number;
  hwPowerBrakeUs: number;
}

export interface DiagnosticsGpu {
  name: string;
  driverVersion: string;
  temperatureC: number;
  powerW: number;
  throttle: GpuThrottle;
  recentTdrCount: number;
  recentDriverErrorCount: number;
}

export interface DiagnosticsGpuResponse {
  supported: boolean;
  gpus: DiagnosticsGpu[];
}

export type CoolingDeviceType = 'pump' | 'fan';
export type CoolingDeviceStatus = 'ok' | 'stalled' | 'suspect' | 'unknown';

export interface DiagnosticsCoolingDevice {
  id: string;
  name: string;
  type: CoolingDeviceType;
  rpm: number;
  targetDutyPercent: number;
  status: CoolingDeviceStatus;
  sinceUtc: string | null;
}

export interface DiagnosticsCoolingResponse {
  supported: boolean;
  devices: DiagnosticsCoolingDevice[];
}

export interface PnpProblem {
  name: string;
  deviceId: string;
  problemCode: number;
  problemText: string;
}

export interface DiagnosticsCounts30d {
  whea: number;
  bugchecks: number;
  dirtyShutdowns: number;
  diskErrors: number;
  tdrs: number;
  gpuDriverErrors: number;
  appCrashes: number;
}

export interface DiagnosticsSystemResponse {
  supported: boolean;
  pnpProblems: PnpProblem[];
  counts30d: DiagnosticsCounts30d;
}

// Every real GET returns null on a network failure or a non-2xx status
// (fetchService's contract). In a dev build that null is replaced with a
// contract-shaped fixture so the UI renders while the service routes are
// still being built; in production DEV_TOOLS is false, so a real failure
// stays null and the view renders its error state, unchanged from today.
async function withMockFallback<T>(real: Promise<T | null>, mockFn: () => T): Promise<T | null> {
  const result = await real;
  if (result !== null) return result;
  if (DEV_TOOLS) return mockFn();
  return null;
}

export function fetchDiagnosticsHealth(): Promise<DiagnosticsHealth | null> {
  return withMockFallback(fetchService<DiagnosticsHealth>('/diagnostics/health'), mock.mockDiagnosticsHealth);
}

export function fetchDiagnosticsIncidents(days = 30): Promise<DiagnosticsIncidentsResponse | null> {
  return withMockFallback(
    fetchService<DiagnosticsIncidentsResponse>(`/diagnostics/incidents?days=${days}`),
    mock.mockDiagnosticsIncidents,
  );
}

export function fetchDiagnosticsSmart(): Promise<DiagnosticsSmartResponse | null> {
  return withMockFallback(fetchService<DiagnosticsSmartResponse>('/diagnostics/smart'), mock.mockDiagnosticsSmart);
}

export function fetchDiagnosticsMemory(): Promise<DiagnosticsMemoryResponse | null> {
  return withMockFallback(fetchService<DiagnosticsMemoryResponse>('/diagnostics/memory'), mock.mockDiagnosticsMemory);
}

export function fetchDiagnosticsGpu(): Promise<DiagnosticsGpuResponse | null> {
  return withMockFallback(fetchService<DiagnosticsGpuResponse>('/diagnostics/gpu'), mock.mockDiagnosticsGpu);
}

export function fetchDiagnosticsCooling(): Promise<DiagnosticsCoolingResponse | null> {
  return withMockFallback(fetchService<DiagnosticsCoolingResponse>('/diagnostics/cooling'), mock.mockDiagnosticsCooling);
}

export function fetchDiagnosticsSystem(): Promise<DiagnosticsSystemResponse | null> {
  return withMockFallback(fetchService<DiagnosticsSystemResponse>('/diagnostics/system'), mock.mockDiagnosticsSystem);
}

export function scheduleMemoryTest(): Promise<ScheduleMemoryTestResponse | null> {
  return withMockFallback(
    postService<ScheduleMemoryTestResponse>('/diagnostics/memory/test', {}),
    mock.mockScheduleMemoryTest,
  );
}

export function cancelMemoryTest(): Promise<CancelMemoryTestResponse | null> {
  return withMockFallback(
    deleteService<CancelMemoryTestResponse>('/diagnostics/memory/test'),
    mock.mockCancelMemoryTest,
  );
}

/**
 * Downloads the support bundle ZIP. Uses fetchServiceBlob (not a plain
 * anchor href) because the route requires the session bearer token, which a
 * browser navigation can't attach; fetchServiceBlob also tunnels over the
 * relay when the panel is off-LAN. Returns false on any failure so the
 * caller can surface a toast.
 */
export async function downloadDiagnosticsBundle(): Promise<boolean> {
  const blob = await fetchServiceBlob('/diagnostics/bundle/download');
  if (!blob) return false;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  a.download = `nexus-diagnostics-${stamp}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return true;
}
