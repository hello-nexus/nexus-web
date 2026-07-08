// Diagnostics API client - typed wrapper over the local service's
// /diagnostics/* routes (contract: .deep-build/diagnostics-contract.md).
// The service routes don't exist yet, so a 404 here (missing route on an
// older/partial service) falls back to contract-shaped mock data in a dev
// build; any other failure (network down, 500) is a real error, not masked.
// The mock module is dynamically imported behind the raw build-define gate
// below so it never enters a production bundle.

import { authFetchWithStatus, fetchServiceBlobWithHeaders } from './service';

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
  // Identical repeats are grouped server-side, newest kept: repeatCount > 1
  // means this entry stands in for that many occurrences, and firstUtc (null
  // when repeatCount is 1) is the earliest of them.
  repeatCount: number;
  firstUtc: string | null;
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

export interface DiagnosticsFetchResult<T> {
  data: T | null;
  mocked: boolean;
}

/** Passed to the cacheable GET endpoints (health/smart/gpu/memory/system) to
 *  bust the service's server-side cache instead of returning a stale snapshot. */
export interface DiagnosticsFetchOptions {
  force?: boolean;
}

interface RequestOpts {
  method?: string;
  body?: unknown;
}

function withRefreshParam(path: string, force?: boolean): string {
  if (!force) return path;
  return `${path}${path.includes('?') ? '&' : '?'}refresh=1`;
}

async function requestJson<T>(path: string, opts?: RequestOpts): Promise<{ data: T | null; status: number }> {
  const { response, status } = await authFetchWithStatus(path, opts);
  if (!response || !response.ok) return { data: null, status };
  try {
    return { data: (await response.json()) as T, status };
  } catch {
    return { data: null, status };
  }
}

type DiagnosticsMockModule = typeof import('./diagnosticsMock');

// Raw build defines (NOT the DEV_TOOLS const re-exported from lib/devTools):
// the transform-time constant fold only eliminates a dynamic import() when
// the guard is this literal expression at the call site - see ToolsView.tsx's
// StorybookModal for the same pattern. This keeps diagnosticsMock.ts's
// fixtures out of a production bundle.
const loadDiagnosticsMock = (import.meta.env.DEV || __DEV_TOOLS__)
  ? (): Promise<DiagnosticsMockModule> => import('./diagnosticsMock')
  : null;

async function withMockFallback<T>(
  path: string,
  pickMock: (mock: DiagnosticsMockModule) => T,
  opts?: RequestOpts,
): Promise<DiagnosticsFetchResult<T>> {
  const { data, status } = await requestJson<T>(path, opts);
  if (data !== null) return { data, mocked: false };
  if (status === 404 && loadDiagnosticsMock) {
    const mock = await loadDiagnosticsMock();
    return { data: pickMock(mock), mocked: true };
  }
  return { data: null, mocked: false };
}

export function fetchDiagnosticsHealth(opts?: DiagnosticsFetchOptions): Promise<DiagnosticsFetchResult<DiagnosticsHealth>> {
  return withMockFallback(withRefreshParam('/diagnostics/health', opts?.force), mock => mock.mockDiagnosticsHealth());
}

export function fetchDiagnosticsIncidents(days = 30): Promise<DiagnosticsFetchResult<DiagnosticsIncidentsResponse>> {
  return withMockFallback(`/diagnostics/incidents?days=${days}`, mock => mock.mockDiagnosticsIncidents());
}

export function fetchDiagnosticsSmart(opts?: DiagnosticsFetchOptions): Promise<DiagnosticsFetchResult<DiagnosticsSmartResponse>> {
  return withMockFallback(withRefreshParam('/diagnostics/smart', opts?.force), mock => mock.mockDiagnosticsSmart());
}

export function fetchDiagnosticsMemory(opts?: DiagnosticsFetchOptions): Promise<DiagnosticsFetchResult<DiagnosticsMemoryResponse>> {
  return withMockFallback(withRefreshParam('/diagnostics/memory', opts?.force), mock => mock.mockDiagnosticsMemory());
}

export function fetchDiagnosticsGpu(opts?: DiagnosticsFetchOptions): Promise<DiagnosticsFetchResult<DiagnosticsGpuResponse>> {
  return withMockFallback(withRefreshParam('/diagnostics/gpu', opts?.force), mock => mock.mockDiagnosticsGpu());
}

export function fetchDiagnosticsCooling(): Promise<DiagnosticsFetchResult<DiagnosticsCoolingResponse>> {
  return withMockFallback('/diagnostics/cooling', mock => mock.mockDiagnosticsCooling());
}

export function fetchDiagnosticsSystem(opts?: DiagnosticsFetchOptions): Promise<DiagnosticsFetchResult<DiagnosticsSystemResponse>> {
  return withMockFallback(withRefreshParam('/diagnostics/system', opts?.force), mock => mock.mockDiagnosticsSystem());
}

export function scheduleMemoryTest(): Promise<DiagnosticsFetchResult<ScheduleMemoryTestResponse>> {
  return withMockFallback(
    '/diagnostics/memory/test',
    mock => mock.mockScheduleMemoryTest(),
    { method: 'POST', body: {} },
  );
}

export function cancelMemoryTest(): Promise<DiagnosticsFetchResult<CancelMemoryTestResponse>> {
  return withMockFallback(
    '/diagnostics/memory/test',
    mock => mock.mockCancelMemoryTest(),
    { method: 'DELETE' },
  );
}

// Content-Disposition: attachment; filename="foo.zip" or filename*=UTF-8''foo.zip.
function filenameFromContentDisposition(header: string | null): string | null {
  if (!header) return null;
  const encodedMatch = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (encodedMatch) {
    try {
      return decodeURIComponent(encodedMatch[1]);
    } catch {
      // Malformed percent-encoding; fall through to the plain form.
    }
  }
  const plainMatch = /filename="?([^";]+)"?/i.exec(header);
  return plainMatch ? plainMatch[1] : null;
}

/**
 * Downloads the support bundle ZIP. Uses fetchServiceBlobWithHeaders (not a
 * plain anchor href) because the route requires the session bearer token,
 * which a browser navigation can't attach; it also tunnels over the relay
 * when the panel is off-LAN. Returns false on any failure so the caller can
 * surface a toast.
 */
export async function downloadDiagnosticsBundle(): Promise<boolean> {
  const result = await fetchServiceBlobWithHeaders('/diagnostics/bundle/download');
  if (!result) return false;
  const url = URL.createObjectURL(result.blob);
  const a = document.createElement('a');
  a.href = url;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  a.download = filenameFromContentDisposition(result.headers.get('Content-Disposition'))
    ?? `nexus-diagnostics-${stamp}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return true;
}
