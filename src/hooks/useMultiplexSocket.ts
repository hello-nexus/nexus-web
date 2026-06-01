import { createContext, useContext, useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { fetchPanelRelay, fetchPanelRemoteControlState } from '../api/panel';
import { isRelayActive, resolveAuthWs, resolveRelayWs, setActiveTransport } from '../api/service';
import { getToken } from '../api/auth';
import { RelayChannel } from './relayChannel';

// The multiplex client drives either the raw LAN WebSocket or, when the LAN
// path can't open, the cloud RelayChannel. Both expose the same WebSocket-like
// surface (readyState + onopen/onmessage/onclose/onerror + send/close), so the
// connection plumbing below treats them uniformly; the only difference is which
// one connect() instantiates. The handler signatures mirror the DOM
// WebSocket's so a native socket assigns directly; RelayChannel implements the
// same shape (synthesizing minimal Event-like objects).
interface MultiplexTransport {
  readyState: number;
  send: (data: string) => void;
  close: () => void;
  onopen: ((e: Event) => void) | null;
  onmessage: ((e: MessageEvent) => void) | null;
  onclose: ((e: CloseEvent) => void) | null;
  onerror: ((e: Event) => void) | null;
}

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

export interface MultiplexContextValue {
  subscribe: (topic: string, listener: (data: unknown) => void) => void;
  unsubscribe: (topic: string, listener: (data: unknown) => void) => void;
  connected: boolean;
  /**
   * Which transport the currently-open connection runs over: 'lan' for the
   * direct /ws WebSocket, 'relay' for the cloud RelayChannel fallback, or
   * null while disconnected. Driven off whichever transport actually opened
   * (set in its onopen, cleared on close), so the UI can surface a relay-mode
   * indicator without inferring it from connection failures.
   */
  transport: 'lan' | 'relay' | null;
  /**
   * True when the Nexus service has disabled Pair Remote (killswitch off).
   * Phone clients in this state can't open the WS or call protected REST
   * routes - render an explicit "disabled by host" surface and skip any
   * UI that depends on live data. Cleared automatically when the host
   * turns the killswitch back on.
   */
  remoteDisabled: boolean;
  /**
   * True when this panel was connected over the CLOUD RELAY and the relay
   * dropped because the host turned the cloud relay OFF (Pair Remote itself is
   * still on - only the relay fallback was disabled). Unlike sessionRevoked
   * this is NOT terminal: the hook slow-polls GET /panel/phone/relay and
   * reconnects automatically the moment the host re-enables the relay. The UI
   * surfaces a "relay turned off" popup in the meantime. Only ever set on a
   * relay transport; a LAN connection never enters this state.
   */
  relayDisabled: boolean;
  /**
   * True when this specific phone session has been removed from the host's
   * paired-devices list (server closed the WS with code 1008 "revoked" while
   * the killswitch is still ON). Terminal for the current session - the only
   * way back is to re-pair, so the overlay surfaces a "Pair again" link and
   * we stop the reconnect loop.
   */
  sessionRevoked: boolean;
  reconnect: () => void;
  /** Wall-clock ms when the next scheduled reconnect attempt will fire, or null if a connect is in flight or the socket is open. */
  nextAttemptAt: number | null;
}

export const MultiplexContext = createContext<MultiplexContextValue | null>(null);

const RECONNECT_MIN_MS = 5000;
const RECONNECT_MAX_MS = 60000;
const REMOTE_DISABLED_POLL_MS = 5000;
// How often a relay-disabled panel re-checks GET /panel/phone/relay for the
// host to turn the cloud relay back on. Mirrors REMOTE_DISABLED_POLL_MS: a slow
// poll is fine because the only thing that clears this state is the host
// flipping a toggle, not anything the phone does.
const RELAY_DISABLED_POLL_MS = 5000;
// WebSocketCloseStatus.PolicyViolation in the service's SubscribedClient.
// CloseRevokedAsync. Distinguishes a server-initiated kick (killswitch or
// single-device revoke) from generic transport drops (1006, 1011, etc.).
const WS_CLOSE_REVOKED = 1008;
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
      // Drop any stale frame when the topic disables. This is the standard
      // "follow external system" pattern - we're clearing local state to
      // reflect that the upstream subscription no longer exists.
       
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
  const wsRef = useRef<MultiplexTransport | null>(null);
  const mountedRef = useRef(true);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const topicsRef = useRef<Map<string, TopicListener>>(new Map());
  const pendingSubsRef = useRef<Set<string>>(new Set());
  const backoffStepRef = useRef(0);
  // Whether the relay fallback has already been tried since the last LAN
  // open-failure / successful open. Caps relay attempts at one per LAN failure
  // so we don't re-dial the (cost-bearing) relay on every backoff retry; the
  // relay is re-attempted only after a fresh LAN socket again fails to open.
  const relayTriedRef = useRef(false);
  const remoteDisabledRef = useRef(false);
  const relayDisabledRef = useRef(false);
  const sessionRevokedRef = useRef(false);
  // Which transport the last OPENED connection ran over. handleDisconnect reads
  // it to tell a relay drop (candidate for the relay-disabled popup) from a LAN
  // drop. Set in wireTransport's onopen; never cleared on close so it still
  // reflects the just-dropped connection when handleDisconnect inspects it.
  const lastTransportRef = useRef<'lan' | 'relay' | null>(null);
  const [connected, setConnected] = useState(false);
  const [transport, setTransport] = useState<'lan' | 'relay' | null>(null);
  const [remoteDisabled, setRemoteDisabled] = useState(false);
  const [relayDisabled, setRelayDisabled] = useState(false);
  const [sessionRevoked, setSessionRevoked] = useState(false);
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
  // Self-reference indirection: the disabled-polling setTimeout below calls
  // handleDisconnect recursively; routing through a ref keeps the linter's
  // TDZ check happy without changing call timing (the timeout fires long
  // after the useCallback body completes).
  const handleDisconnectRef = useRef<(code?: number) => Promise<void>>(async () => {});
  // closeCode: numeric WebSocket close status reported by the browser. The
  // service uses 1008 PolicyViolation with reason "revoked" both for
  // killswitch-off (kick all) and single-device revoke; once we've ruled out
  // the killswitch, a 1008 close means *this* session was specifically
  // removed and the only way back is to re-pair.
  const handleDisconnect = useCallback(async (closeCode?: number) => {
    if (!mountedRef.current) return;
    let killswitchEnabled: boolean | null = null;
    try {
      // Read the killswitch state through the transport-aware fetch layer so a
      // remote-origin panel checks it over the relay instead of firing a doomed
      // http://localhost request (the state endpoint answers 200 with
      // {enabled} either way, so null here means "couldn't reach", not "off").
      const body = await fetchPanelRemoteControlState();
      // The mount check after every await is load-bearing: an unmount during
      // the fetch must not leave a setTimeout chain running forever on a
      // dead component, which would also resurrect remoteDisabled state.
      if (!mountedRef.current) return;
      if (body) {
        killswitchEnabled = body.enabled !== false;
        if (!killswitchEnabled) {
          remoteDisabledRef.current = true;
          setRemoteDisabled(true);
          clearTimeout(reconnectTimer.current);
          setNextAttemptAt(Date.now() + REMOTE_DISABLED_POLL_MS);
          reconnectTimer.current = setTimeout(() => {
            if (!mountedRef.current) return;
            setNextAttemptAt(null);
            void handleDisconnectRef.current();
          }, REMOTE_DISABLED_POLL_MS);
          return;
        }
      }
    } catch { /* network glitch - killswitchEnabled stays null */ }
    if (!mountedRef.current) return;

    // Server closed us with PolicyViolation and the killswitch is either ON
    // (definitely a single-device revoke - KickPhoneSessionsAsync ran
    // against our session id) or we couldn't reach the public state
    // endpoint to confirm. Default to revoked in both cases: the alternative
    // is the auth-failure reconnect loop with no UI surface, which is the
    // exact bug this branch exists to prevent. If we guessed wrong (network
    // glitch + transport 1008), the manual retry in reconnect() clears the
    // flag and tries fresh.
    if (closeCode === WS_CLOSE_REVOKED && killswitchEnabled !== false) {
      sessionRevokedRef.current = true;
      setSessionRevoked(true);
      clearTimeout(reconnectTimer.current);
      setNextAttemptAt(null);
      return;
    }

    // Relay-disabled: the panel was running over the cloud relay and the relay
    // dropped while Pair Remote itself is still ON. The likely cause is the host
    // turning the cloud relay toggle OFF (GET /panel/phone/relay → {enabled:
    // false}), which force-closes the relay socket. Mirror the killswitch's
    // poll-and-reconnect, but with a visible "relay turned off" popup: park in a
    // relayDisabled state and slow-poll the relay endpoint until the host
    // re-enables it, then reconnect. Only relevant on a relay transport (LAN
    // drops never enter here) and only while we can still confirm the relay
    // toggle's state (a null read means "couldn't reach" - fall through to the
    // normal backoff rather than guess). Once relayDisabledRef latches, the
    // re-poll keeps re-checking even though lastTransportRef no longer matters.
    if (killswitchEnabled !== false
        && (relayDisabledRef.current || lastTransportRef.current === 'relay')) {
      let relayEnabled: boolean | null = null;
      try {
        const relayBody = await fetchPanelRelay();
        if (!mountedRef.current) return;
        if (relayBody) relayEnabled = relayBody.enabled !== false;
      } catch { /* network glitch - relayEnabled stays null */ }
      if (!mountedRef.current) return;
      if (relayEnabled === false) {
        relayDisabledRef.current = true;
        setRelayDisabled(true);
        clearTimeout(reconnectTimer.current);
        setNextAttemptAt(Date.now() + RELAY_DISABLED_POLL_MS);
        reconnectTimer.current = setTimeout(() => {
          if (!mountedRef.current) return;
          setNextAttemptAt(null);
          void handleDisconnectRef.current();
        }, RELAY_DISABLED_POLL_MS);
        return;
      }
      // Relay is back on (or we were already parked and it re-enabled). If we
      // were locked out, clear the state and reconnect immediately.
      if (relayDisabledRef.current) {
        relayDisabledRef.current = false;
        setRelayDisabled(false);
        backoffStepRef.current = 0;
        relayTriedRef.current = false;
        clearTimeout(reconnectTimer.current);
        setNextAttemptAt(null);
        connectRef.current();
        return;
      }
      // Relay still enabled and we weren't parked: a transient relay drop.
      // Fall through to the normal backoff below.
    }

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

  useEffect(() => {
    handleDisconnectRef.current = handleDisconnect;
  }, [handleDisconnect]);

  // Wire a transport (LAN WebSocket or RelayChannel) into the multiplex
  // plumbing. Identical behavior for both: on open, reset backoff, clear any
  // disabled/revoked state, and replay subscriptions; on message, dispatch
  // multiplex frames to topic listeners. Returns the onclose code so the
  // caller can decide between relay fallback and the normal backoff path.
  const wireTransport = useCallback((
    transport: MultiplexTransport,
    kind: 'lan' | 'relay',
    onClose: (code: number) => void,
    onOpen?: () => void,
  ) => {
    transport.onopen = () => {
      onOpen?.();
      setTransport(kind);
      lastTransportRef.current = kind;
      // Publish the live transport to the REST fetch layer so off-LAN (relay)
      // calls tunnel over the relay while LAN calls stay direct (see service.ts).
      setActiveTransport(kind);
      backoffStepRef.current = 0;
      if (remoteDisabledRef.current) {
        remoteDisabledRef.current = false;
        setRemoteDisabled(false);
      }
      if (relayDisabledRef.current) {
        relayDisabledRef.current = false;
        setRelayDisabled(false);
      }
      if (sessionRevokedRef.current) {
        sessionRevokedRef.current = false;
        setSessionRevoked(false);
      }
      setConnected(true);
      // Re-send all active subscriptions on reconnect.
      const activeTopics = Array.from(topicsRef.current.keys());
      if (activeTopics.length > 0) {
        transport.send(JSON.stringify({ sub: activeTopics }));
      }
      // Send any subs that were queued while disconnected.
      if (pendingSubsRef.current.size > 0) {
        transport.send(JSON.stringify({ sub: Array.from(pendingSubsRef.current) }));
        pendingSubsRef.current.clear();
      }
    };

    transport.onmessage = (e) => {
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

    transport.onclose = (event) => {
      setConnected(false);
      setTransport(null);
      setActiveTransport(null);
      onClose(event.code);
    };

    transport.onerror = () => transport.close();
  }, []);

  // Cloud-relay fallback. Connect a RelayChannel (client role) and, on
  // peer-up, run the identical {t,d} multiplex protocol over the encrypted
  // channel. A failed open / no peer-up / peer-down surfaces via onClose and
  // routes back into the normal backoff via handleDisconnect. The relay never
  // carries the 1008 killswitch-revoke semantics — only the LAN /ws path does —
  // so handleDisconnect's revoke branch is unreachable from here.
  const tryRelay = useCallback(async () => {
    if (!mountedRef.current) return;
    const token = await getToken();
    if (!mountedRef.current) return;
    if (!token) { void handleDisconnect(); return; }
    const channel = new RelayChannel(resolveRelayWs(), token);
    wsRef.current = channel;
    // On relay peer-up, clear the relay-tried gate so a later LAN failure can
    // re-attempt relay; on relay close, return to the normal backoff path.
    wireTransport(
      channel,
      'relay',
      () => { void handleDisconnect(); },
      () => { relayTriedRef.current = false; },
    );
    void channel.connect();
  }, [handleDisconnect, wireTransport]);

  const connect = useCallback(async () => {
    close();
    setNextAttemptAt(null);
    // Remote origin (e.g. hellonexus.com) with a session token: the LAN /ws
    // resolves to ws://localhost — the phone, not the PC, and unreachable. Skip
    // that doomed open entirely and connect the relay directly. tryRelay() falls
    // back into handleDisconnect() on failure, so backoff still applies.
    if (isRelayActive()) {
      relayTriedRef.current = true;
      void tryRelay();
      return;
    }
    try {
      const url = await resolveAuthWs('/ws');
      if (!mountedRef.current) return;

      const ws = new WebSocket(url);
      wsRef.current = ws;
      // Track whether the LAN socket ever reached OPEN this attempt. If it
      // closes WITHOUT having opened, and the close is not the 1008
      // killswitch-revoke, the LAN path is unreachable (e.g. client-isolated
      // Wi-Fi) — fall back to the relay before any backoff. A 1008 close, or a
      // drop after a successful open, follows the existing handleDisconnect
      // path unchanged.
      let lanOpened = false;

      wireTransport(
        ws,
        'lan',
        (code) => {
          // LAN socket closed before it ever opened, and not the 1008
          // killswitch-revoke ⇒ the LAN path is unreachable. Try the relay
          // once before falling into backoff; on relay failure the relay's
          // onClose routes to handleDisconnect() so backoff resumes. Already
          // tried this cycle ⇒ skip straight to backoff (no relay re-dial).
          if (!lanOpened && code !== WS_CLOSE_REVOKED && !relayTriedRef.current
              && mountedRef.current && enabled) {
            relayTriedRef.current = true;
            void tryRelay();
            return;
          }
          void handleDisconnect(code);
        },
        () => { lanOpened = true; relayTriedRef.current = false; },
      );
    } catch {
      setConnected(false);
      setTransport(null);
      setActiveTransport(null);
      void handleDisconnect();
    }
  }, [close, enabled, handleDisconnect, tryRelay, wireTransport]);

  // Keep the ref in sync so handleDisconnect can call the latest connect
  // without recreating handleDisconnect (which would loop the deps cycle).
  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  const reconnect = useCallback(() => {
    backoffStepRef.current = 0;
    relayTriedRef.current = false;
    clearTimeout(reconnectTimer.current);
    setNextAttemptAt(null);
    if (!mountedRef.current || !enabled) return;
    // If the user manually retries while we're in remote-disabled OR
    // relay-disabled mode, re-check state immediately rather than firing a
    // doomed WS open (both are host-side toggles the phone can't fix).
    if (remoteDisabledRef.current || relayDisabledRef.current) {
      void handleDisconnect();
      return;
    }
    // Manual retry from a revoked session: clear the terminal flag so a
    // successful upgrade (e.g. the user re-paired in another tab and the
    // cookie is now valid) drops the overlay. If auth still fails the next
    // onclose will set it again.
    if (sessionRevokedRef.current) {
      sessionRevokedRef.current = false;
      setSessionRevoked(false);
    }
    connect();
  }, [connect, enabled, handleDisconnect]);

  useEffect(() => {
    mountedRef.current = true;
    if (enabled) {
      backoffStepRef.current = 0;
      // connect() opens the WS; the setState calls inside (setConnected,
      // setNextAttemptAt) only fire after async resolution / events, so
      // they don't actually cascade-render within this effect body.
       
      connect();
    } else {
      backoffStepRef.current = 0;
      // Tearing down on disable is a sync external-system update; the
      // setState calls reflect that the socket is now closed.
      setConnected(false);
      setTransport(null);
      setActiveTransport(null);
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
      ? { subscribe, unsubscribe, connected, transport, remoteDisabled, relayDisabled, sessionRevoked, reconnect, nextAttemptAt }
      : null,
    [enabled, subscribe, unsubscribe, connected, transport, remoteDisabled, relayDisabled, sessionRevoked, reconnect, nextAttemptAt],
  );
}
