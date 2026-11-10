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
import { useMultiplex, useTopicCallback } from './useMultiplexSocket';

export type SensorAlertAddResult = { result: 'created'; rule: SensorAlertRule } | { result: 'limit' | 'error'; rule: null };

export interface UseSensorAlerts {
  rules: SensorAlertRule[];
  states: SensorAlertState[];
  /** A request is in flight. */
  loading: boolean;
  /** The list has been fetched at least once. */
  loaded: boolean;
  error: boolean;
  atLimit: boolean;
  /** Shows an edit immediately (a slider mid-drag) without writing it. */
  preview: (rule: SensorAlertRule) => void;
  /** Shows and writes the full rule; writes for one rule are sent in order, newest last. `onFail` runs when the service refused that write. */
  save: (rule: SensorAlertRule, onFail?: () => void) => void;
  add: (rule: NewSensorAlertRule) => Promise<SensorAlertAddResult>;
  remove: (id: string) => Promise<boolean>;
  acknowledge: (id: string) => Promise<boolean>;
  refresh: () => void;
}

/**
 * Sensor alert rules (GET /diagnostics/alerts) plus live states from the
 * `diagnostics/alerts` topic. States are pushed on transitions only, so the
 * list is refetched on socket reconnect and window focus to drop a stale
 * active state. Rule edits are optimistic: a refused write refetches the
 * canonical list so the UI never shows a rule the service lacks.
 */
export function useSensorAlerts(enabled: boolean): UseSensorAlerts {
  const [rules, setRules] = useState<SensorAlertRule[]>([]);
  const [states, setStates] = useState<SensorAlertState[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const mountedRef = useRef(true);
  const rulesRef = useRef<SensorAlertRule[]>([]);
  rulesRef.current = rules;
  const seqRef = useRef(0);
  // Per rule id: the newest rule awaiting a write, and the write loop in flight.
  const pendingRef = useRef(new Map<string, { rule: SensorAlertRule; onFail?: () => void }>());
  const inFlightRef = useRef(new Map<string, Promise<void>>());
  const removingRef = useRef(new Set<string>());

  const load = useCallback(() => {
    const seq = ++seqRef.current;
    setLoading(true);
    void (async () => {
      const res = await fetchSensorAlerts();
      if (!mountedRef.current || seq !== seqRef.current) return;
      if (res.ok && res.data) {
        setRules(res.data.rules);
        setStates(res.data.states);
        setError(false);
        setLoaded(true);
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

  // A frame sent while the socket was down never arrives, so resync after a reconnect.
  const connected = useMultiplex()?.connected ?? false;
  const wasConnectedRef = useRef(connected);
  useEffect(() => {
    if (enabled && connected && !wasConnectedRef.current) load();
    wasConnectedRef.current = connected;
  }, [enabled, connected, load]);

  useEffect(() => {
    if (!enabled) return undefined;
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [enabled, load]);

  const replaceRule = useCallback((rule: SensorAlertRule) => {
    setRules(prev => prev.map(r => (r.id === rule.id ? rule : r)));
  }, []);

  // Sends queued writes for one rule until none is left. A refused write reports itself, then the
  // loop moves on to a newer queued edit; only when none is queued does it resync from the service.
  const flush = useCallback((id: string): Promise<void> => {
    const running = inFlightRef.current.get(id);
    if (running) return running;
    const loop = (async () => {
      try {
        for (let next = pendingRef.current.get(id); next; next = pendingRef.current.get(id)) {
          pendingRef.current.delete(id);
          const res = await updateSensorAlert(next.rule);
          if (res.ok || removingRef.current.has(id)) continue;
          if (mountedRef.current) next.onFail?.();
          if (!pendingRef.current.has(id) && mountedRef.current) load();
        }
      } finally {
        inFlightRef.current.delete(id);
      }
    })();
    inFlightRef.current.set(id, loop);
    return loop;
  }, [load]);

  const save = useCallback((rule: SensorAlertRule, onFail?: () => void) => {
    replaceRule(rule);
    pendingRef.current.set(rule.id, { rule, onFail });
    void flush(rule.id);
  }, [replaceRule, flush]);

  // Leaving the page must not drop an edit that is queued behind a write in flight.
  useEffect(() => () => {
    for (const id of pendingRef.current.keys()) void flush(id);
  }, [flush]);

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
    removingRef.current.add(id);
    pendingRef.current.delete(id);
    // A write still in flight would otherwise land after the delete and 404.
    await inFlightRef.current.get(id);
    const res = await deleteSensorAlert(id);
    removingRef.current.delete(id);
    if (!mountedRef.current) return res.ok;
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
    rules, states, loading, loaded, error,
    atLimit: rules.length >= MAX_SENSOR_ALERT_RULES,
    preview: replaceRule, save, add, remove, acknowledge, refresh: load,
  };
}
