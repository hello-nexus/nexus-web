import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchMonitoringEvents, normaliseEventDto,
  type MonitoringEventDto, type MonitoringEventKind, type TimelineEvent,
} from '../api/monitoringEvents';
import { fetchMonitoringPrivacy, type PrivacySession } from '../api/monitoringPrivacy';
import { appDisplayName, iconKindForCapability, type PrivacyIconKind } from '../panel/widgets/monitoring/page/privacyHelpers';
import { useMultiplex, useTopicCallback } from './useMultiplexSocket';

// Trailing debounce for a moving `domain` (the caller re-renders this on
// every live-follow tick) - resets on every domain change, so a continuously
// sliding window never fetches; only a pause at least this long lets it
// through. refetch() bypasses this and fires immediately.
const DOMAIN_DEBOUNCE_MS = 250;

// Past coveredTo by more than this, a domain move needs a real fetch - wider
// than one live-tail tick (~1s) so plain following never crosses it; the
// push subscriptions keep coverage current within it.
const DOMAIN_TO_COVERAGE_SLACK_MS = 5_000;

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

/** Merges one pushed stored event into `list`, ascending by t. Replaces an
 *  existing entry with the same id in place; returns `list` itself (same
 *  reference) when the push carries no actual change, so a duplicate/replay
 *  frame never triggers a re-render. */
export function upsertStoredEvent(list: readonly MonitoringEventDto[], event: MonitoringEventDto): MonitoringEventDto[] {
  const idx = list.findIndex(e => e.id === event.id);
  if (idx !== -1) {
    const existing = list[idx];
    if (existing.t === event.t && existing.kind === event.kind && existing.label === event.label
        && existing.detail === event.detail && existing.custom === event.custom) {
      return list as MonitoringEventDto[];
    }
    const next = list.slice();
    next[idx] = event;
    return next;
  }
  const insertAt = list.findIndex(e => e.t > event.t);
  const next = list.slice();
  if (insertAt === -1) next.push(event); else next.splice(insertAt, 0, event);
  return next;
}

/** The wire omits `end` (rather than sending null) while a capability is
 *  still in use - normalises a pushed session to the PrivacySession shape
 *  GET already guarantees, so an open session compares equal across pushes. */
export function normalisePrivacySession(session: PrivacySession): PrivacySession {
  return { ...session, end: session.end ?? null };
}

/** Merges one pushed privacy session into `list`, identified by
 *  (app, capability, start) - the same identity mergeTimelineEvents keys a
 *  privacy TimelineEvent on. A start push inserts a new open session; the
 *  matching end push replaces it in place. Returns `list` itself when the
 *  push carries no actual change. */
export function upsertPrivacySession(list: readonly PrivacySession[], session: PrivacySession): PrivacySession[] {
  const idx = list.findIndex(s => s.app === session.app && s.capability === session.capability && s.start === session.start);
  if (idx !== -1) {
    if (list[idx].end === session.end) return list as PrivacySession[];
    const next = list.slice();
    next[idx] = session;
    return next;
  }
  const insertAt = list.findIndex(s => s.start > session.start);
  const next = list.slice();
  if (insertAt === -1) next.push(session); else next.splice(insertAt, 0, session);
  return next;
}

export interface UseMonitoringEventsResult {
  /** Ascending by t, privacy + stored merged. */
  events: TimelineEvent[];
  refetch: () => void;
  loading: boolean;
}

/**
 * Fetches stored monitoring events and privacy-access sessions for `domain`
 * and merges them into one timeline, then keeps that coverage current via
 * the 'monitoring/events'/'monitoring/privacy' push topics instead of
 * refetching on every live-tail tick. Debounced + seq-guarded like
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
  // The [from, to] window `events` is currently known-complete for. Null
  // until the first fetch lands, forcing that one unconditionally. `to`
  // trust-extends to the domain's own `to` on a settle that doesn't need a
  // real fetch - see DOMAIN_TO_COVERAGE_SLACK_MS.
  const coveredFromRef = useRef<number | null>(null);
  const coveredToRef = useRef<number | null>(null);

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
      coveredFromRef.current = from;
      coveredToRef.current = to;
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
      coveredFromRef.current = null;
      coveredToRef.current = null;
      setEvents([]);
      setLoading(false);
      return;
    }
    const forced = forcedRef.current;
    forcedRef.current = false;
    const needsFetch = forced
      || coveredFromRef.current === null || coveredToRef.current === null
      || from < coveredFromRef.current
      || to > coveredToRef.current + DOMAIN_TO_COVERAGE_SLACK_MS;
    if (!needsFetch) {
      // Nothing past the last real fetch is missing - the push
      // subscriptions below have kept storedRef/privacyRef current for
      // anything that happened since, so trust that instead of fetching.
      coveredToRef.current = to;
      return;
    }
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

  // A dropped socket misses whatever pushed while it was down - resync with
  // a real fetch rather than trust coverage the push subscriptions couldn't
  // actually maintain during the outage. Edge-detected off `connected` (no
  // reconnect counter on the multiplex context, matching useMetricHistory).
  const connected = useMultiplex()?.connected ?? false;
  const prevConnectedRef = useRef(connected);
  useEffect(() => {
    if (enabled && connected && !prevConnectedRef.current) refetch();
    prevConnectedRef.current = connected;
  }, [enabled, connected, refetch]);

  useTopicCallback('monitoring/events', enabled, (raw) => {
    const event = normaliseEventDto(raw as MonitoringEventDto);
    const next = upsertStoredEvent(storedRef.current, event);
    if (next === storedRef.current) return;
    storedRef.current = next;
    if (coveredToRef.current !== null) coveredToRef.current = Math.max(coveredToRef.current, event.t);
    setEvents(mergeTimelineEvents(storedRef.current, privacyRef.current));
  });

  useTopicCallback('monitoring/privacy', enabled, (raw) => {
    const session = normalisePrivacySession(raw as PrivacySession);
    const next = upsertPrivacySession(privacyRef.current, session);
    if (next === privacyRef.current) return;
    privacyRef.current = next;
    const pushedT = session.end ?? session.start;
    if (coveredToRef.current !== null) coveredToRef.current = Math.max(coveredToRef.current, pushedT);
    setEvents(mergeTimelineEvents(storedRef.current, privacyRef.current));
  });

  return { events, refetch, loading };
}
