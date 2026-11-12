// Sensor alert rules client for the service's /diagnostics/alerts routes.
// Values low/high are in the sensor's native unit (temperature always Celsius).

import { authFetchWithStatus } from './service';
import { requestJson } from './fetchOutcome';
import { buildQuery, type MetricHistoryFetchResult, type MetricHistoryQuery, type MetricHistoryResponse } from './monitoringHistory';

export const MAX_SENSOR_ALERT_RULES = 50;

export type SensorAlertSeverity = 'watch' | 'act';
export type SensorAlertStateKind = 'ok' | 'pending' | 'active' | 'unavailable';

/** The component temperature rules the service always keeps; null on a user rule. */
export type BuiltInSensorKind = 'cpuTemp' | 'gpuTemp' | 'storageTemp' | 'ramTemp' | 'fanSpeed';

/** Resolver category of a built-in's fixed sensor ref; the live sensor lookup cannot resolve it. */
export const BUILTIN_SENSOR_CATEGORY = 'builtin';

export interface SensorRef {
  category: string;
  id: string;
  name: string;
  type: string;
  parentName: string;
}

/** What a built-in actually reads right now (wire only, absent on a user rule): one sensor, the mean of several, or a drive's SMART temperature. */
export interface SensorAlertSource {
  kind: 'sensor' | 'average' | 'drive' | 'channel';
  sensor: SensorRef | null;
  sensors: SensorRef[];
  hardwareName: string;
}

export interface SensorAlertRule {
  id: string;
  enabled: boolean;
  sensor: SensorRef;
  low: number | null;
  high: number | null;
  raiseAfterSeconds: number;
  clearAfterSeconds: number;
  severity: SensorAlertSeverity;
  notifyDesktop: boolean;
  showInHealth: boolean;
  repeatMinutes: number;
  builtIn: BuiltInSensorKind | null;
  source?: SensorAlertSource;
}

export type NewSensorAlertRule = Omit<SensorAlertRule, 'id' | 'builtIn'>;

export interface SensorAlertState {
  ruleId: string;
  state: SensorAlertStateKind;
  value?: number | null;
  since?: string | null;
  extreme?: number | null;
  direction?: 'above' | 'below' | null;
  /** The limit crossed, while pending or active. */
  threshold?: number | null;
  /** A finished alert still waiting for the user to dismiss it (ISO UTC); the ended fields describe it. */
  endedAt?: string | null;
  endedPeak?: number | null;
  endedThreshold?: number | null;
  endedDirection?: 'above' | 'below' | null;
  acknowledged: boolean;
}

export interface SensorAlertsResponse {
  rules: SensorAlertRule[];
  states: SensorAlertState[];
}

/** The `diagnostics/alerts` websocket frame. */
export interface SensorAlertsFrame {
  states: SensorAlertState[];
}

/** ok is false for a transport failure or any non-2xx; status 409 on create means the rule limit is reached. */
export interface SensorAlertResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
  /** The service's refusal reason when it names one (a 409 for a sensor another entry already tracks). */
  code?: 'sensor_already_tracked';
  /** With `code`: the entry that already tracks the sensor. */
  trackedRuleId?: string;
}

async function call<T>(path: string, method: string, body?: unknown): Promise<SensorAlertResult<T>> {
  const { response, status } = await authFetchWithStatus(path, { method, body, cache: method === 'GET' ? 'no-store' : undefined });
  if (!response || !response.ok) {
    const text = response ? await response.text().catch(() => '') : '';
    if (!text.includes('sensor_already_tracked')) return { ok: false, status, data: null };
    let trackedRuleId: string | undefined;
    try { trackedRuleId = (JSON.parse(text) as { ruleId?: string }).ruleId; } catch { /* the code alone is enough */ }
    return { ok: false, status, data: null, code: 'sensor_already_tracked' as const, trackedRuleId };
  }
  if (status === 204) return { ok: true, status, data: null };
  try {
    return { ok: true, status, data: (await response.json()) as T };
  } catch {
    return { ok: true, status, data: null };
  }
}

const BASE = '/diagnostics/alerts';

export const fetchSensorAlerts = () => call<SensorAlertsResponse>(BASE, 'GET');
export const createSensorAlert = (rule: NewSensorAlertRule) => call<SensorAlertRule>(BASE, 'POST', rule);
export const updateSensorAlert = (rule: SensorAlertRule) => call<SensorAlertRule>(`${BASE}/${encodeURIComponent(rule.id)}`, 'PUT', rule);
export const deleteSensorAlert = (id: string) => call<null>(`${BASE}/${encodeURIComponent(id)}`, 'DELETE');
/** Writes the factory state back to one built-in (or all four without an id); resolves with the refreshed list. */
export const resetBuiltInSensorAlerts = (id?: string) =>
  call<SensorAlertsResponse>(`${BASE}/builtins/reset${id ? `?id=${encodeURIComponent(id)}` : ''}`, 'POST', {});
export const acknowledgeSensorAlert = (id: string) => call<null>(`${BASE}/${encodeURIComponent(id)}/acknowledge`, 'POST', {});

/** Recorded values of the tracked sensors (every enabled rule), in the same shape as the monitoring history; no dev mock. */
export async function fetchSensorAlertHistory(query: MetricHistoryQuery): Promise<MetricHistoryFetchResult> {
  const { data, status } = await requestJson<MetricHistoryResponse>(`${BASE}/history-series?${buildQuery({ ...query, series: undefined })}`);
  return { data, mocked: false, unsupported: data === null && status === 404 };
}
