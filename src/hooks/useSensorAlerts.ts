import { useCallback, useEffect, useRef, useState } from 'react';
import {
  MAX_SENSOR_ALERT_RULES,
  acknowledgeSensorAlert,
  createSensorAlert,
  deleteSensorAlert,
  fetchSensorAlerts,
  updateSensorAlert,
  type NewSensorAlertRule,
  type SensorAlertRule,
  type SensorAlertState,
  type SensorAlertsFrame,
} from '../api/diagnosticsAlerts';
import { useTopicCallback } from './useMultiplexSocket';

export type SensorAlertAddResult = { result: 'created'; rule: SensorAlertRule } | { result: 'limit' | 'error'; rule: null };

export interface UseSensorAlerts {
  rules: SensorAlertRule[];
  states: SensorAlertState[];
  loading: boolean;
  error: boolean;
  atLimit: boolean;
  /** Shows an edit immediately (a slider mid-drag) without writing it. */
  preview: (rule: SensorAlertRule) => void;
  /** Shows and writes the full rule; writes for one rule are sent in order, latest wins. `onFail` runs when the service refused it. */
  save: (rule: SensorAlertRule, onFail?: () => void) => void;
  add: (rule: NewSensorAlertRule) => Promise<SensorAlertAddResult>;
  remove: (id: string) => Promise<boolean>;
  acknowledge: (id: string) => Promise<boolean>;
  refresh: () => void;
}

/**
 * Sensor alert rules (GET /diagnostics/alerts) plus live states from the
 * `diagnostics/alerts` topic. Rule edits are optimistic: a refused write
 * refetches the canonical list so the UI never shows a rule the service lacks.
 */
export function useSensorAlerts(enabled: boolean): UseSensorAlerts {
  const [rules, setRules] = useState<SensorAlertRule[]>([]);
  const [states, setStates] = useState<SensorAlertState[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState(false);
  const mountedRef = useRef(true);
  const rulesRef = useRef<SensorAlertRule[]>([]);
  rulesRef.current = rules;
  const seqRef = useRef(0);
  // Per rule id: the newest rule awaiting a write, and whether a write is in flight.
  const pendingRef = useRef(new Map<string, { rule: SensorAlertRule; onFail?: () => void }>());
  const inFlightRef = useRef(new Set<string>());

  const load = useCallback(() => {
    const seq = ++seqRef.current;
    void (async () => {
      const res = await fetchSensorAlerts();
      if (!mountedRef.current || seq !== seqRef.current) return;
      if (res.ok && res.data) {
        setRules(res.data.rules);
        setStates(res.data.states);
        setError(false);
      } else {
        setError(true);
      }
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    if (!enabled) {
      setLoading(false);
      return () => { mountedRef.current = false; };
    }
    load();
    return () => { mountedRef.current = false; };
  }, [enabled, load]);

  useTopicCallback('diagnostics/alerts', enabled, raw => {
    const frame = raw as Partial<SensorAlertsFrame> | null;
    if (!frame || !Array.isArray(frame.states)) return;
    setStates(frame.states);
    // A state for a rule this client lacks (added elsewhere) means the list is stale.
    if (frame.states.some(s => !rulesRef.current.some(r => r.id === s.ruleId))) load();
  });

  const replaceRule = useCallback((rule: SensorAlertRule) => {
    setRules(prev => prev.map(r => (r.id === rule.id ? rule : r)));
  }, []);

  const flush = useCallback(async (id: string) => {
    if (inFlightRef.current.has(id)) return;
    inFlightRef.current.add(id);
    try {
      for (let next = pendingRef.current.get(id); next; next = pendingRef.current.get(id)) {
        pendingRef.current.delete(id);
        const res = await updateSensorAlert(next.rule);
        if (!mountedRef.current) return;
        if (!res.ok) {
          pendingRef.current.delete(id);
          next.onFail?.();
          load();
          return;
        }
      }
    } finally {
      inFlightRef.current.delete(id);
    }
  }, [load]);

  const save = useCallback((rule: SensorAlertRule, onFail?: () => void) => {
    replaceRule(rule);
    pendingRef.current.set(rule.id, { rule, onFail });
    void flush(rule.id);
  }, [replaceRule, flush]);

  const add = useCallback(async (rule: NewSensorAlertRule): Promise<SensorAlertAddResult> => {
    const res = await createSensorAlert(rule);
    if (!mountedRef.current) return { result: 'error', rule: null };
    if (res.ok && res.data) {
      const created = res.data;
      setRules(prev => (prev.some(r => r.id === created.id) ? prev : [...prev, created]));
      return { result: 'created', rule: created };
    }
    if (res.status === 409) {
      load();
      return { result: 'limit', rule: null };
    }
    return { result: 'error', rule: null };
  }, [load]);

  const remove = useCallback(async (id: string) => {
    pendingRef.current.delete(id);
    const res = await deleteSensorAlert(id);
    if (!mountedRef.current) return false;
    if (res.ok) {
      setRules(prev => prev.filter(r => r.id !== id));
      setStates(prev => prev.filter(s => s.ruleId !== id));
    }
    return res.ok;
  }, []);

  const acknowledge = useCallback(async (id: string) => {
    const res = await acknowledgeSensorAlert(id);
    if (res.ok && mountedRef.current) {
      setStates(prev => prev.map(s => (s.ruleId === id ? { ...s, acknowledged: true } : s)));
    }
    return res.ok;
  }, []);

  return {
    rules, states, loading, error,
    atLimit: rules.length >= MAX_SENSOR_ALERT_RULES,
    preview: replaceRule, save, add, remove, acknowledge, refresh: load,
  };
}
