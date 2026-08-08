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
  | 'gpuDriver' | 'appCrash' | 'liveKernel' | 'memDiag'
  | 'kernel' | 'oomKill' | 'segfault' | 'unitFailed';

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

// Nullable per SmartDriveInfo (nexus-service SmartHealthMonitor.cs): a drive
// with no SMART support returns early with only id/name/serial/bus/sizeBytes
// set, so every reading below it is null.
export interface DiagnosticsDrive {
  id: string;
  name: string;
  serial: string;
  bus: DiagnosticsDriveBus;
  sizeBytes: number | null;
  temperatureC: number | null;
  powerOnHours: number | null;
  powerCycles: number | null;
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

// Nullable per MemoryModuleInfo (nexus-service SmbiosParser.cs): each field is
// null when the SMBIOS Type 17 record is too short to carry it, or carries the
// spec's unknown value. Only slot is always present.
export interface MemoryModule {
  slot: string;
  sizeBytes: number | null;
  maxSpeedMts: number | null;
  configuredSpeedMts: number | null;
  manufacturer: string | null;
  partNumber: string | null;
}

export type MemoryTestResultValue = 'passed' | 'failed' | 'unknown';

export interface MemoryTestResult {
  timeUtc: string;
  result: MemoryTestResultValue;
  detail: string | null;
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

// Nullable per GpuThrottleInfo (nexus-service GpuHealthMonitor.cs): the three
// NVML-backed counters go null when the violation-status read returns
// non-Success; hwThermalUs has no NVML source and is always null.
export interface GpuThrottle {
  active: GpuThrottleReason[];
  swPowerCapUs: number | null;
  swThermalUs: number | null;
  hwThermalUs: number | null;
  hwPowerBrakeUs: number | null;
}

// Nullable per GpuInfoWire (nexus-service DiagnosticsHealthRoutes.cs).
// driverVersion is one driver-level query shared by every card; temperatureC
// and powerW go null when that card's NVML read returns non-Success.
export interface DiagnosticsGpu {
  name: string;
  driverVersion: string | null;
  temperatureC: number | null;
  powerW: number | null;
  throttle: GpuThrottle;
  recentTdrCount: number;
}

export interface DiagnosticsGpuResponse {
  supported: boolean;
  gpus: DiagnosticsGpu[];
}

export type CoolingDeviceType = 'pump' | 'fan';
export type CoolingDeviceStatus = 'ok' | 'stalled' | 'suspect' | 'unknown';

// rpm/targetDutyPercent are nullable per CoolingStallDevice (nexus-service
// CoolingStallDetector.cs). The only production feeder sources both from
// non-nullable ints, so nulls do not reach the wire today.
export interface DiagnosticsCoolingDevice {
  id: string;
  name: string;
  type: CoolingDeviceType;
  rpm: number | null;
  targetDutyPercent: number | null;
  status: CoolingDeviceStatus;
  sinceUtc: string | null;
}

export interface DiagnosticsCoolingResponse {
  supported: boolean;
  devices: DiagnosticsCoolingDevice[];
}

export type DiagnosticsTemperatureKind = 'cpu' | 'gpu' | 'storage' | 'ram';

export interface DiagnosticsTemperaturePoint {
  t: number;
  avg: number;
  max: number;
}

export interface DiagnosticsTemperatureSeries {
  id: string;
  kind: DiagnosticsTemperatureKind;
  name: string;
  points: DiagnosticsTemperaturePoint[];
}

export interface DiagnosticsTemperatureEpisode {
  componentId: string;
  name: string;
  startUtc: string;
  endUtc: string;
  peakC: number;
  thresholdC: number;
}

export interface DiagnosticsTemperaturesResponse {
  supported: boolean;
  bucketMinutes: number;
  retentionDays: number;
  series: DiagnosticsTemperatureSeries[];
  episodes: DiagnosticsTemperatureEpisode[];
}

/** A relative window (hours back from now) or a single service-host-local
 *  calendar day (YYYY-MM-DD, 5-minute buckets) - never both. */
export type DiagnosticsTemperatureQuery = { hours: number } | { date: string };

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

/** hours is clamped server-side to 1..336; the range picker only ever sends
 *  24, 72, 168, or 336. date (YYYY-MM-DD, service-host-local calendar day)
 *  is mutually exclusive with hours and 400s server-side if malformed,
 *  in the future, or older than the response's retentionDays. */
export function fetchDiagnosticsTemperatures(query: DiagnosticsTemperatureQuery): Promise<DiagnosticsFetchResult<DiagnosticsTemperaturesResponse>> {
  const qs = 'date' in query ? `date=${query.date}` : `hours=${query.hours}`;
  return withMockFallback(`/diagnostics/temperatures?${qs}`, mock => mock.mockDiagnosticsTemperatures(query));
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

export interface OpenEventViewerResponse {
  opened: boolean;
}

export interface OpenDeviceManagerResponse {
  opened: boolean;
}

export interface ClearEventLogsResponse {
  cleared: boolean;
  systemError: string | null;
  applicationError: string | null;
}

// These two bypass withMockFallback deliberately: a 404 (no such route, or
// LocalhostOnly rejecting a non-loopback origin) must surface as a real
// failure, not a faked "opened"/"cleared" success - unlike the read-only GET
// endpoints above, a fake success here would report a destructive action
// completed when nothing happened.
export async function openDiagnosticsEventViewer(): Promise<OpenEventViewerResponse | null> {
  const { data } = await requestJson<OpenEventViewerResponse>('/diagnostics/events/open-viewer', { method: 'POST', body: {} });
  return data;
}

/** Opens Windows Device Manager (devmgmt.msc) via the user-session helper.
 *  Same reasoning as openDiagnosticsEventViewer above: bypasses the mock
 *  fallback so a 404 surfaces as a real failure rather than a faked "opened".
 *  No per-device selection - devmgmt.msc takes no device argument. */
export async function openDiagnosticsDeviceManager(): Promise<OpenDeviceManagerResponse | null> {
  const { data } = await requestJson<OpenDeviceManagerResponse>('/diagnostics/devices/open-manager', { method: 'POST', body: {} });
  return data;
}

/** Clears the Windows System and Application event logs for the whole
 *  machine, not just Nexus's own events. Irreversible - gated by a
 *  destructive ConfirmModal in IncidentsSection. A non-null result with
 *  `cleared: false` means the service completed the request but one or both
 *  logs failed to clear (see systemError/applicationError) - the caller
 *  still resyncs, since the service may have partially applied the clear. */
export async function clearDiagnosticsEventLogs(): Promise<ClearEventLogsResponse | null> {
  const { data } = await requestJson<ClearEventLogsResponse>('/diagnostics/events/clear', { method: 'POST', body: {} });
  return data;
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

/**
 * Downloads the diagnostics report PDF. Same fetchServiceBlobWithHeaders
 * mechanism as downloadDiagnosticsBundle above: the route requires the
 * session bearer token and may tunnel over the relay when off-LAN.
 */
export async function downloadDiagnosticsReport(): Promise<boolean> {
  const result = await fetchServiceBlobWithHeaders('/diagnostics/report.pdf');
  if (!result) return false;
  const url = URL.createObjectURL(result.blob);
  const a = document.createElement('a');
  a.href = url;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  a.download = filenameFromContentDisposition(result.headers.get('Content-Disposition'))
    ?? `nexus-diagnostics-${stamp}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return true;
}
