import { createContext, useContext, useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { resolveAuthWs, resolveHttp } from '../api/service';

interface TopicListener {
  refCount: number;
  listeners: Set<(data: unknown) => void>;
}

// Per-topic cache of the latest frame, used by useTopic to seed state
// across remounts (e.g. after closing the panel edit drawer) so the
// widget keeps showing the last value instead of blanking while the WS
// resub lands. NOT replayed through subscribe() because useTopicCallback
// consumers ("refetch on push") would interpret a replayed stale frame
// as a real server push and trigger unnecessary refetches.
const lastFrameCache = new Map<string, unknown>();

interface MultiplexContextValue {
  subscribe: (topic: string, listener: (data: unknown) => void) => void;
  unsubscribe: (topic: string, listener: (data: unknown) => void) => void;
  connected: boolean;
  /**
   * True when the Qos service has disabled Pair Remote (killswitch off).
   * Phone clients in this state can't open the WS or call protected REST
   * routes - render an explicit "disabled by host" surface and skip any
   * UI that depends on live data. Cleared automatically when the host
   * turns the killswitch back on.
   */
  remoteDisabled: boolean;
  reconnect: () => void;
  /** Wall-clock ms when the next scheduled reconnect attempt will fire, or null if a connect is in flight or the socket is open. */
  nextAttemptAt: number | null;
}

export const MultiplexContext = createContext<MultiplexContextValue | null>(null);

const RECONNECT_MIN_MS = 5000;
const RECONNECT_MAX_MS = 60000;
const REMOTE_DISABLED_POLL_MS = 5000;
// Hard ceiling on a single multiplex frame. The largest legitimate topic
// today is the 1Hz monitoring composite, which clocks in well under 512KB
// even with topN process + network lists at their cap. Anything bigger is
// either a server bug or a malformed frame — drop it before parse to
// avoid a JSON.parse blowout on a long-lived socket.
const MAX_FRAME_BYTES = 1024 * 1024;

export function useMultiplex(): MultiplexContextValue | null {
  return useContext(MultiplexContext);
}

/**
 * Hook that subscribes to a single topic on the multiplexed WebSocket.
 * Subscriptions are ref-counted: the first subscriber for a topic sends
 * {"sub":["topic"]} to the server, and the last unsubscriber sends
 * {"unsub":["topic"]}. Navigation between views drives subscriptions
 * automatically via React component lifecycle.
 */
export function useTopic<T>(topic: string, enabled = true): T | null {
  const ctx = useContext(MultiplexContext);
  // Seed from the cached last frame so a remount (e.g. closing the
  // panel edit drawer) renders the previous value on first paint.
  const [data, setData] = useState<T | null>(() =>
    enabled ? ((lastFrameCache.get(topic) as T | undefined) ?? null) : null,
  );

  useEffect(() => {
    if (!ctx || !enabled) {
      setData(null);
      return;
    }

    // Re-seed on topic change before the resub round-trip lands.
    const cached = lastFrameCache.get(topic);
    if (cached !== undefined) setData(cached as T);

    const listener = (raw: unknown) => setData(raw as T);
    ctx.subscribe(topic, listener);
    return () => ctx.unsubscribe(topic, listener);
  }, [ctx, topic, enabled]);

  return data;
}

/**
 * Subscribe to a topic and fire a callback on every received frame. Useful
 * for "refetch on push" patterns: instead of polling on a setInterval, the
 * widget calls useTopicCallback('lighting', enabled, refetch) and refetches
 * the canonical resource whenever the server says it changed. The callback
 * ref is stored so consumers can pass an inline closure without re-binding
 * the subscription on every render.
 */
export function useTopicCallback(topic: string, enabled: boolean, onFrame: (data: unknown) => void): void {
  const ctx = useContext(MultiplexContext);
  const cbRef = useRef(onFrame);
  useEffect(() => { cbRef.current = onFrame; }, [onFrame]);

  useEffect(() => {
    if (!ctx || !enabled) return;
    const listener = (raw: unknown) => cbRef.current(raw);
    ctx.subscribe(topic, listener);
    return () => ctx.unsubscribe(topic, listener);
  }, [ctx, topic, enabled]);
}

/**
 * Creates the multiplex WebSocket connection and topic management.
 * Call this once at the app level and pass the return value to MultiplexContext.Provider.
 */
export function useMultiplexConnection(enabled: boolean): MultiplexContextValue | null {
  const wsRef = useRef<WebSocket | null>(null);
  const mountedRef = useRef(true);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const topicsRef = useRef<Map<string, TopicListener>>(new Map());
  const pendingSubsRef = useRef<Set<string>>(new Set());
  const backoffStepRef = useRef(0);
  const remoteDisabledRef = useRef(false);
  const [connected, setConnected] = useState(false);
  const [remoteDisabled, setRemoteDisabled] = useState(false);
  const [nextAttemptAt, setNextAttemptAt] = useState<number | null>(null);

  const close = useCallback(() => {
    clearTimeout(reconnectTimer.current);
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  const scheduleReconnect = useCallback((connectFn: () => void) => {
    if (!mountedRef.current) return;
    const delay = Math.min(
      RECONNECT_MAX_MS,
      RECONNECT_MIN_MS * Math.pow(2, backoffStepRef.current),
    );
    backoffStepRef.current += 1;
    setNextAttemptAt(Date.now() + delay);
    reconnectTimer.current = setTimeout(() => {
      setNextAttemptAt(null);
      connectFn();
    }, delay);
  }, []);

  // After any disconnect (kicked mid-session OR cold-open while OFF), check
  // the Pair Remote killswitch before reconnecting. If it's OFF the WS
  // upgrade would just be 403-rejected anyway; switch to slow-polling the
  // public state endpoint until the host re-enables, then resume.
  const connectRef = useRef<() => void>(() => {});
  const handleDisconnect = useCallback(async () => {
    if (!mountedRef.current) return;
    try {
      const res = await fetch(resolveHttp('/panel/phone/remote-control'), { cache: 'no-store' });
      // The mount check after every await is load-bearing: an unmount during
      // the fetch must not leave a setTimeout chain running forever on a
      // dead component, which would also resurrect remoteDisabled state.
      if (!mountedRef.current) return;
      if (res.ok) {
        const body = await res.json() as { enabled?: boolean };
        if (!mountedRef.current) return;
        if (body.enabled === false) {
          remoteDisabledRef.current = true;
          setRemoteDisabled(true);
          clearTimeout(reconnectTimer.current);
          setNextAttemptAt(Date.now() + REMOTE_DISABLED_POLL_MS);
          reconnectTimer.current = setTimeout(() => {
            if (!mountedRef.current) return;
            setNextAttemptAt(null);
            void handleDisconnect();
          }, REMOTE_DISABLED_POLL_MS);
          return;
        }
      }
    } catch { /* network glitch - fall through to normal backoff */ }
    if (!mountedRef.current) return;

    // Killswitch is on (or endpoint unreachable). If we were locked out,
    // clear that state and reconnect immediately; otherwise normal backoff.
    if (remoteDisabledRef.current) {
      remoteDisabledRef.current = false;
      setRemoteDisabled(false);
      backoffStepRef.current = 0;
      clearTimeout(reconnectTimer.current);
      setNextAttemptAt(null);
      connectRef.current();
      return;
    }
    scheduleReconnect(() => connectRef.current());
  }, [scheduleReconnect]);

  const connect = useCallback(async () => {
    close();
    setNextAttemptAt(null);
    try {
      const url = await resolveAuthWs('/ws');
      if (!mountedRef.current) return;

      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        backoffStepRef.current = 0;
        if (remoteDisabledRef.current) {
          remoteDisabledRef.current = false;
          setRemoteDisabled(false);
        }
        setConnected(true);
        // Re-send all active subscriptions on reconnect.
        const activeTopics = Array.from(topicsRef.current.keys());
        if (activeTopics.length > 0) {
          ws.send(JSON.stringify({ sub: activeTopics }));
        }
        // Send any subs that were queued while disconnected.
        if (pendingSubsRef.current.size > 0) {
          ws.send(JSON.stringify({ sub: Array.from(pendingSubsRef.current) }));
          pendingSubsRef.current.clear();
        }
      };

      ws.onmessage = (e) => {
        try {
          if (typeof e.data !== 'string' || e.data.length > MAX_FRAME_BYTES) return;
          const parsed = JSON.parse(e.data);
          if (!parsed || typeof parsed !== 'object' || typeof parsed.t !== 'string') return;
          const msg = parsed as { t: string; d: unknown };
          lastFrameCache.set(msg.t, msg.d);
          const entry = topicsRef.current.get(msg.t);
          if (entry) {
            for (const listener of entry.listeners) {
              listener(msg.d);
            }
          }
        } catch { /* malformed frame */ }
      };

      ws.onclose = () => {
        setConnected(false);
        void handleDisconnect();
      };

      ws.onerror = () => ws.close();
    } catch {
      setConnected(false);
      void handleDisconnect();
    }
  }, [close, handleDisconnect]);

  // Keep the ref in sync so handleDisconnect can call the latest connect
  // without recreating handleDisconnect (which would loop the deps cycle).
  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  const reconnect = useCallback(() => {
    backoffStepRef.current = 0;
    clearTimeout(reconnectTimer.current);
    setNextAttemptAt(null);
    if (!mountedRef.current || !enabled) return;
    // If the user manually retries while we're in remote-disabled mode,
    // re-check state immediately rather than firing a doomed WS open.
    if (remoteDisabledRef.current) {
      void handleDisconnect();
      return;
    }
    connect();
  }, [connect, enabled, handleDisconnect]);

  useEffect(() => {
    mountedRef.current = true;
    if (enabled) {
      backoffStepRef.current = 0;
      connect();
    } else {
      backoffStepRef.current = 0;
      setConnected(false);
      setNextAttemptAt(null);
      close();
    }
    return () => {
      mountedRef.current = false;
      close();
    };
  }, [enabled, connect, close]);

  const subscribe = useCallback((topic: string, listener: (data: unknown) => void) => {
    const topics = topicsRef.current;
    let entry = topics.get(topic);
    if (!entry) {
      entry = { refCount: 0, listeners: new Set() };
      topics.set(topic, entry);
    }
    entry.refCount++;
    entry.listeners.add(listener);

    if (entry.refCount === 1) {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ sub: [topic] }));
      } else {
        pendingSubsRef.current.add(topic);
      }
    }
  }, []);

  const unsubscribe = useCallback((topic: string, listener: (data: unknown) => void) => {
    const topics = topicsRef.current;
    const entry = topics.get(topic);
    if (!entry) return;

    entry.listeners.delete(listener);
    entry.refCount--;

    if (entry.refCount <= 0) {
      topics.delete(topic);
      pendingSubsRef.current.delete(topic);
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ unsub: [topic] }));
      }
    }
  }, []);

  return useMemo<MultiplexContextValue | null>(
    () => enabled
      ? { subscribe, unsubscribe, connected, remoteDisabled, reconnect, nextAttemptAt }
      : null,
    [enabled, subscribe, unsubscribe, connected, remoteDisabled, reconnect, nextAttemptAt],
  );
}
