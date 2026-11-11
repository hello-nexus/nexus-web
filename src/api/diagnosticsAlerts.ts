// Sensor alert rules client for the service's /diagnostics/alerts routes.
// Values low/high are in the sensor's native unit (temperature always Celsius).

import { authFetchWithStatus } from './service';
import { requestJson } from './fetchOutcome';
import { buildQuery, type MetricHistoryFetchResult, type MetricHistoryQuery, type MetricHistoryResponse } from './monitoringHistory';

export const MAX_SENSOR_ALERT_RULES = 10;

export type SensorAlertSeverity = 'watch' | 'act';
export type SensorAlertStateKind = 'ok' | 'pending' | 'active' | 'unavailable';

export interface SensorRef {
  category: string;
  id: string;
  name: string;
  type: string;
  parentName: string;
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
}

export type NewSensorAlertRule = Omit<SensorAlertRule, 'id'>;

export interface SensorAlertState {
  ruleId: string;
  state: SensorAlertStateKind;
  value?: number | null;
  since?: string | null;
  extreme?: number | null;
  direction?: 'above' | 'below' | null;
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
}

async function call<T>(path: string, method: string, body?: unknown): Promise<SensorAlertResult<T>> {
  const { response, status } = await authFetchWithStatus(path, { method, body, cache: method === 'GET' ? 'no-store' : undefined });
  if (!response || !response.ok) return { ok: false, status, data: null };
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
export const acknowledgeSensorAlert = (id: string) => call<null>(`${BASE}/${encodeURIComponent(id)}/acknowledge`, 'POST', {});

/** Recorded values of the tracked sensors (every enabled rule), in the same shape as the monitoring history; no dev mock. */
export async function fetchSensorAlertHistory(query: MetricHistoryQuery): Promise<MetricHistoryFetchResult> {
  const { data, status } = await requestJson<MetricHistoryResponse>(`${BASE}/history-series?${buildQuery({ ...query, series: undefined })}`);
  return { data, mocked: false, unsupported: data === null && status === 404 };
}
