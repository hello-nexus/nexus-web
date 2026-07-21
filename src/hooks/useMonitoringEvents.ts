import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchMonitoringEvents, type MonitoringEventDto, type MonitoringEventKind, type TimelineEvent } from '../api/monitoringEvents';
import { fetchMonitoringPrivacy, type PrivacySession } from '../api/monitoringPrivacy';
import { appDisplayName, iconKindForCapability, type PrivacyIconKind } from '../panel/widgets/monitoring/page/privacyHelpers';

// Trailing debounce for a moving `domain` (the caller re-renders this on
// every live-follow tick) - resets on every domain change, so a continuously
// sliding window never fetches; only a pause at least this long lets it
// through. refetch() bypasses this and fires immediately.
const DOMAIN_DEBOUNCE_MS = 250;

// iconKindForCapability already collapses both graphicsCapture variants to
// 'screen', so the four privacy event kinds are exactly its four icon kinds
// prefixed - keeping one capability-grouping rule for the lane, the process
// list indicators, and the privacy history modal.
const PRIVACY_KIND_BY_ICON_KIND: Record<PrivacyIconKind, MonitoringEventKind> = {
  webcam: 'privacy-webcam',
  microphone: 'privacy-microphone',
  location: 'privacy-location',
  screen: 'privacy-screen',
};

/**
 * Pure merge of the two raw fetch payloads into one ascending-by-t
 * TimelineEvent[] - unit-tested directly (see useMonitoringEvents.test.ts)
 * so the kind mapping and label extraction don't need a hook harness.
 */
export function mergeTimelineEvents(stored: readonly MonitoringEventDto[], privacySessions: readonly PrivacySession[]): TimelineEvent[] {
  const storedEvents: TimelineEvent[] = stored.map(e => ({
    key: `stored:${e.id}`,
    id: e.id,
    t: e.t,
    kind: e.kind as MonitoringEventKind,
    label: e.label,
    detail: e.detail ?? null,
    custom: e.custom,
    endT: null,
  }));
  const privacyEvents: TimelineEvent[] = privacySessions.map(s => ({
    key: `privacy:${s.capability}:${s.app}:${s.start}`,
    id: null,
    t: s.start,
    kind: PRIVACY_KIND_BY_ICON_KIND[iconKindForCapability(s.capability)],
    label: appDisplayName(s.app),
    detail: s.app,
    custom: false,
    endT: s.end,
  }));
  return [...storedEvents, ...privacyEvents].sort((a, b) => a.t - b.t);
}

export interface UseMonitoringEventsResult {
  /** Ascending by t, privacy + stored merged. */
  events: TimelineEvent[];
  refetch: () => void;
  loading: boolean;
}

/**
 * Fetches stored monitoring events and privacy-access sessions for `domain`
 * and merges them into one timeline. Debounced + seq-guarded like
 * useMetricHistory - a stale in-flight response never overwrites a newer
 * one. A failed privacy fetch (unsupported or errored) never blocks stored
 * events from rendering; a failed stored-events fetch leaves the previously
 * loaded stored events in place rather than flashing the timeline empty.
 */
export function useMonitoringEvents(domain: [number, number], enabled: boolean): UseMonitoringEventsResult {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const storedRef = useRef<MonitoringEventDto[]>([]);
  const privacyRef = useRef<PrivacySession[]>([]);
  const seqRef = useRef(0);
  const mountedRef = useRef(true);
  const debounceRef = useRef<number | null>(null);
  const [refetchNonce, setRefetchNonce] = useState(0);
  // Set by refetch() just before it bumps refetchNonce, so the effect below
  // can tell "explicit refetch" apart from "domain moved" and skip the
  // debounce for the former.
  const forcedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const load = useCallback((from: number, to: number) => {
    const seq = ++seqRef.current;
    setLoading(true);
    void (async () => {
      const [storedOutcome, privacyOutcome] = await Promise.allSettled([
        fetchMonitoringEvents(from, to),
        fetchMonitoringPrivacy({ from, to }),
      ]);
      if (!mountedRef.current || seq !== seqRef.current) return;
      if (storedOutcome.status === 'fulfilled') storedRef.current = storedOutcome.value;
      if (privacyOutcome.status === 'fulfilled') privacyRef.current = privacyOutcome.value.data?.sessions ?? [];
      setEvents(mergeTimelineEvents(storedRef.current, privacyRef.current));
      setLoading(false);
    })();
  }, []);

  const [from, to] = domain;
  useEffect(() => {
    if (!enabled) {
      // Bump the sequence so a load already in flight fails its own guard on
      // resolve. Without this it repopulates the refs and re-renders markers
      // after the toggle went off, and with a pinned (frozen) domain the
      // effect never runs again to clear them.
      seqRef.current++;
      storedRef.current = [];
      privacyRef.current = [];
      setEvents([]);
      setLoading(false);
      return;
    }
    const forced = forcedRef.current;
    forcedRef.current = false;
    if (debounceRef.current !== null) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      debounceRef.current = null;
      load(from, to);
    }, forced ? 0 : DOMAIN_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current !== null) {
        window.clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [enabled, from, to, refetchNonce, load]);

  const refetch = useCallback(() => {
    forcedRef.current = true;
    setRefetchNonce(n => n + 1);
  }, []);

  return { events, refetch, loading };
}
