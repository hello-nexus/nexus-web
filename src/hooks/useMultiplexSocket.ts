import { createContext, useContext, useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { fetchPanelRelay, fetchPanelRemoteControlState } from '../api/panel';
import {
  isLanSealedActive, isRelayActive, resolveAuthWs, resolveLanSealedWs, resolveRelayWs,
  setActiveHttpTunnel, setActiveTransport, type ActiveTransport,
} from '../api/service';
import { getToken } from '../api/auth';
import { RelayChannel } from './relayChannel';
import { resetRelayHttpTunnel } from '../api/relayHttp';
import { isRtcDirectEligible, openRtcDirect, RtcRuntimeChannel, type RtcDirectConnection } from '../api/rtcDirect';

// The multiplex client drives either the raw LAN WebSocket or, when the LAN
// path can't open, the cloud RelayChannel (which a live relay connection may
// itself later hot-swap for the WebRTC direct upgrade, RtcRuntimeChannel). All
// three expose the same WebSocket-like surface (readyState +
// onopen/onmessage/onclose/onerror + send/close), so the connection plumbing
// below treats them uniformly; the only difference is which one connect()
// instantiates. The handler signatures mirror the DOM WebSocket's so a native
// socket assigns directly; the others implement the same shape (synthesizing
// minimal Event-like objects).
interface MultiplexTransport {
  readyState: number;
  send: (data: string) => void;
  close: () => void;
  onopen: ((e: Event) => void) | null;
  onmessage: ((e: MessageEvent) => void) | null;
  onclose: ((e: CloseEvent) => void) | null;
  onerror: ((e: Event) => void) | null;
}

// Re-punch backoff after a failed/dropped direct upgrade: doubles up to a cap
// so a flapping punch (or a 403 killswitch) never hammers POST /rtc/offer on
// every relay reconnect.
const DIRECT_BACKOFF_MIN_MS = 30000;
const DIRECT_BACKOFF_MAX_MS = 300000;

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

// Live counters read by the renderer memory probe (src/diag/memoryProbe.ts).
// `opens` increments on every transport open, so `opens - 1` approximates the
// reconnect count (it also counts lan/relay/sealed/direct transport
// switches). upgrade* + directDrops track the WebRTC hot-swap attempts.
// Module-scoped so the probe reads it without threading through React context.
export const multiplexDiag = {
  opens: 0,
  topics: 0,
  listeners: 0,
  transport: null as ActiveTransport | null,
  connected: false,
  upgradeAttempts: 0,
  upgradeSuccesses: 0,
  upgradeFailures: 0,
  directDrops: 0,
};

export interface MultiplexContextValue {
  subscribe: (topic: string, listener: (data: unknown) => void) => void;
  unsubscribe: (topic: string, listener: (data: unknown) => void) => void;
  connected: boolean;
  /**
   * Which transport the currently-open connection runs over: 'lan' for the
   * direct /ws WebSocket, 'relay' for the cloud RelayChannel fallback,
   * 'lan-sealed' for the local sealed /secure-tunnel, 'direct' for the WebRTC
   * data-channel P2P upgrade, or null while disconnected. Driven off whichever
   * transport actually opened (set in its onopen, cleared on close), so the UI
   * can surface a relay/direct-mode indicator without inferring it from
   * connection failures. The cloud-relay indicator keys off 'relay' only, so a
   * sealed LAN connection shows no satellite icon.
   */
  transport: ActiveTransport | null;
  /**
   * True when the Nexus service has disabled Pair Remote (killswitch off).
   * Phone clients in this state can't open the WS or call protected REST
   * routes - render an explicit "disabled by host" surface and skip any
   * UI that depends on live data. Cleared automatically when the host
   * turns the killswitch back on.
   */
  remoteDisabled: boolean;
  /**
   * True when this panel was connected over the CLOUD RELAY (or the WebRTC
   * direct upgrade off one) and dropped because the host turned the cloud
   * relay OFF (Pair Remote itself is still on - only the relay fallback was
   * disabled). Unlike sessionRevoked this is NOT terminal: the hook
   * slow-polls GET /panel/phone/relay and reconnects automatically the moment
   * the host re-enables the relay. The UI surfaces a "relay turned off"
   * popup in the meantime. Only ever set off a LAN transport.
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
// Hard ceiling on a single multiplex frame. The largest valid topic
// today is the 1Hz monitoring composite, which clocks in well under 512KB
// even with topN process + network lists at their cap. Anything bigger is
// either a server bug or a malformed frame - drop it before parse to
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
export function useMultiplexConnection(enabled: boolean, wired = false): MultiplexContextValue | null {
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
  const lastTransportRef = useRef<ActiveTransport | null>(null);
  // Direct-upgrade (WebRTC) state. See attemptDirectUpgrade/swapToDirect below
  // for the state machine; kept as refs (not React state) since none of it
  // drives a render on its own - only the resulting transport/connected
  // changes do, via the normal wireTransport plumbing.
  const directConnRef = useRef<RtcDirectConnection | null>(null);
  const directUpgradeInFlightRef = useRef(false);
  const directBackoffStepRef = useRef(0);
  const directNextAttemptAtRef = useRef(0);
  // A relay connection that opened WHILE a punch attempt was already in
  // flight for a different (earlier) connection - remembered so the in-flight
  // attempt's completion can re-trigger a punch for it, rather than that
  // connection never getting one at all.
  const pendingRetryChannelRef = useRef<RelayChannel | null>(null);
  // Single retry timer for a punch that failed while its relay connection
  // stayed open: a future relay open is the only OTHER trigger for
  // attemptDirectUpgrade, and none may ever come if this connection stays
  // healthy. Cleared on close()/teardown, on that relay channel closing, and
  // on a successful swap; re-arming replaces whatever was pending.
  const directRetryTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [connected, setConnected] = useState(false);
  const [transport, setTransport] = useState<ActiveTransport | null>(null);
  const [remoteDisabled, setRemoteDisabled] = useState(false);
  const [relayDisabled, setRelayDisabled] = useState(false);
  const [sessionRevoked, setSessionRevoked] = useState(false);
  const [nextAttemptAt, setNextAttemptAt] = useState<number | null>(null);

  const close = useCallback(() => {
    clearTimeout(reconnectTimer.current);
    clearTimeout(directRetryTimerRef.current);
    directRetryTimerRef.current = undefined;
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
      wsRef.current = null;
    }
    // The direct connection owns a peer connection + a second (http) data
    // channel beyond wsRef's runtime channel - tear the whole thing down too.
    if (directConnRef.current) {
      directConnRef.current.close();
      directConnRef.current = null;
      setActiveHttpTunnel(null);
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

    // Relay-disabled: the panel was running over the cloud relay (or the
    // WebRTC direct upgrade off one) and dropped while Pair Remote itself is
    // still ON. The likely cause is the host turning the cloud relay toggle
    // OFF (GET /panel/phone/relay → {enabled: false}), which force-closes the
    // relay socket - a live direct connection also depends on that same
    // session, so a direct drop probes the same way, or a killswitch-off
    // relay never re-opens for the next punch and the phone would otherwise
    // loop the normal backoff forever with no explanation. Mirror the
    // killswitch's poll-and-reconnect, but with a visible "relay turned off"
    // popup: park in a relayDisabled state and slow-poll the relay endpoint
    // until the host re-enables it, then reconnect. Only relevant off LAN
    // (LAN drops never enter here) and only while we can still confirm the
    // relay toggle's state (a null read means "couldn't reach" - fall through
    // to the normal backoff rather than guess). Once relayDisabledRef
    // latches, the re-poll keeps re-checking even though lastTransportRef no
    // longer matters.
    if (killswitchEnabled !== false
        && (relayDisabledRef.current || lastTransportRef.current === 'relay' || lastTransportRef.current === 'direct')) {
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
    if (wired) {
      if (!mountedRef.current) return;
      setNextAttemptAt(null);
      reconnectTimer.current = setTimeout(() => connectRef.current(), 500);
    } else {
      scheduleReconnect(() => connectRef.current());
    }
  }, [scheduleReconnect, wired]);

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
    kind: ActiveTransport,
    onClose: (code: number) => void,
    onOpen?: () => void,
  ) => {
    transport.onopen = () => {
      onOpen?.();
      multiplexDiag.opens++;
      multiplexDiag.transport = kind;
      multiplexDiag.connected = true;
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
      multiplexDiag.connected = false;
      multiplexDiag.transport = null;
      setConnected(false);
      setTransport(null);
      setActiveTransport(null);
      onClose(event.code);
    };

    transport.onerror = () => transport.close();
  }, []);

  // Re-punch backoff reset: an actual network change (Wi-Fi reconnect, network
  // switch) makes the last punch failure's backoff stale, so the next relay
  // open should try again promptly rather than wait out the old delay.
  useEffect(() => {
    const handleOnline = () => {
      directBackoffStepRef.current = 0;
      directNextAttemptAtRef.current = 0;
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, []);

  // Returns the delay so the caller can arm a retry timer for exactly when
  // this backoff expires.
  const scheduleDirectBackoff = useCallback((): number => {
    const delay = Math.min(
      DIRECT_BACKOFF_MAX_MS,
      DIRECT_BACKOFF_MIN_MS * Math.pow(2, directBackoffStepRef.current),
    );
    directBackoffStepRef.current += 1;
    directNextAttemptAtRef.current = Date.now() + delay;
    return delay;
  }, []);

  // Hot-swap the live relay connection for a freshly opened direct connection.
  // Wires the runtime channel through the same wireTransport plumbing - its
  // already-open state publishes 'direct' and re-subscribes topics exactly
  // like any other transport open - routes REST at the direct HTTP tunnel,
  // then detaches the superseded relay socket's onclose before closing it
  // (mirrors the top-level close() helper) so that close never reaches
  // handleDisconnect. Detaching beats a consumed-once flag: closing an
  // ALREADY-closed RelayChannel is a no-op that never fires onclose at all, so
  // a flag expecting to be cleared by it would latch and swallow the next
  // unrelated close (see attemptDirectUpgrade's readyState guard, which is
  // what keeps a dead relayChannel from ever reaching this function).
  const swapToDirect = useCallback((relayChannel: RelayChannel, conn: RtcDirectConnection) => {
    directConnRef.current = conn;
    directBackoffStepRef.current = 0;
    clearTimeout(directRetryTimerRef.current);
    directRetryTimerRef.current = undefined;
    multiplexDiag.upgradeSuccesses++;
    wireTransport(conn.runtime, 'direct', (code) => {
      multiplexDiag.directDrops++;
      if (directConnRef.current === conn) directConnRef.current = null;
      setActiveHttpTunnel(null);
      scheduleDirectBackoff();
      conn.close();
      // Revert to the relay path via the existing reconnect machinery - a
      // fresh connect() picks relay again on a remote origin.
      if (wsRef.current === conn.runtime) {
        wsRef.current = null;
        void handleDisconnect(code);
      }
    });
    wsRef.current = conn.runtime;
    setActiveHttpTunnel(conn.http);
    // The REST-over-relay tunnel (a second, independent relay WS keyed off
    // rid_http) is no longer read while direct is active - close it rather
    // than leave it parked on the cloud relay for the whole direct session.
    // It lazily reopens the moment REST falls back to relay (a direct drop).
    resetRelayHttpTunnel();
    relayChannel.onclose = null;
    relayChannel.close();
  }, [wireTransport, handleDisconnect, scheduleDirectBackoff]);

  // Background WebRTC hole-punch off a just-opened relay connection. At most
  // one attempt in flight (directUpgradeInFlightRef); a relay connection that
  // opens while another attempt is still in flight is remembered
  // (pendingRetryChannelRef) and re-attempted once that attempt settles,
  // rather than skipped forever. Skipped entirely for a wired/kiosk surface,
  // while the killswitch/relay-off/revoked terminal states are active, or
  // before the re-punch backoff has elapsed. A failed punch (including a 403
  // killswitch-off answer) engages that backoff so a flapping relay
  // connection can't hammer POST /rtc/offer - and, if the relay connection is
  // still open, arms a timer to retry against THIS SAME connection when the
  // backoff expires. A future relay open is the only other trigger, and none
  // may come if this connection stays healthy (e.g. the network condition
  // that broke the punch clears up without the relay ever dropping) -
  // without the timer the phone would stay on relay indefinitely.
  const attemptDirectUpgrade = useCallback((relayChannel: RelayChannel) => {
    if (wired) return;
    if (directUpgradeInFlightRef.current) {
      pendingRetryChannelRef.current = relayChannel;
      return;
    }
    if (!isRtcDirectEligible()) return;
    if (remoteDisabledRef.current || relayDisabledRef.current || sessionRevokedRef.current) return;
    if (Date.now() < directNextAttemptAtRef.current) return;
    directUpgradeInFlightRef.current = true;
    multiplexDiag.upgradeAttempts++;
    // attemptDirectUpgrade's own guards (in-flight, eligibility, terminal
    // states, the backoff gate, and the wsRef identity + readyState check
    // below) make a stale fire harmless even if this relayChannel closes
    // between now and when the timer fires and something misses clearing it.
    const armRetry = (delayMs: number) => {
      clearTimeout(directRetryTimerRef.current);
      directRetryTimerRef.current = setTimeout(() => {
        directRetryTimerRef.current = undefined;
        attemptDirectUpgrade(relayChannel);
      }, delayMs);
    };
    void (async () => {
      let conn: RtcDirectConnection | null = null;
      try {
        const token = await getToken();
        if (!token) throw new Error('rtc direct: no token');
        conn = await openRtcDirect(token);
        // Superseded (unmounted, a different relay connection took over, the
        // relay itself already dropped while the punch was in flight, or the
        // fresh connection didn't actually land open) - discard it. Checking
        // relayChannel.readyState (not just wsRef identity) matters: a relay
        // drop leaves wsRef pointing at the same now-CLOSED channel until the
        // next connect() runs, so identity alone would miss it and swap
        // against a dead relay session.
        const relayStillOpen = mountedRef.current && wsRef.current === relayChannel
          && relayChannel.readyState === RelayChannel.OPEN;
        if (!relayStillOpen || conn.runtime.readyState !== RtcRuntimeChannel.OPEN) {
          conn.close();
          // The punch itself failed to land even though nothing else
          // superseded this relay session - retry it directly rather than
          // wait on a relay-open event that may never come.
          if (relayStillOpen) armRetry(scheduleDirectBackoff());
          return;
        }
        swapToDirect(relayChannel, conn);
      } catch {
        multiplexDiag.upgradeFailures++;
        armRetry(scheduleDirectBackoff());
        conn?.close();
      } finally {
        directUpgradeInFlightRef.current = false;
        const retryChannel = pendingRetryChannelRef.current;
        pendingRetryChannelRef.current = null;
        if (retryChannel && retryChannel.readyState === RelayChannel.OPEN) {
          attemptDirectUpgrade(retryChannel);
        }
      }
    })();
  }, [wired, swapToDirect, scheduleDirectBackoff]);

  // Cloud-relay fallback. Connect a RelayChannel (client role) and, on
  // peer-up, run the identical {t,d} multiplex protocol over the encrypted
  // channel. A failed open / no peer-up / peer-down surfaces via onClose and
  // routes back into the normal backoff via handleDisconnect. The relay never
  // carries the 1008 killswitch-revoke semantics - only the LAN /ws path does -
  // so handleDisconnect's revoke branch is unreachable from here.
  const tryRelay = useCallback(async () => {
    if (!mountedRef.current) return;
    const token = await getToken();
    if (!mountedRef.current) return;
    if (!token) { void handleDisconnect(); return; }
    const channel = new RelayChannel(resolveRelayWs(), token);
    wsRef.current = channel;
    // On relay peer-up, clear the relay-tried gate so a later LAN failure can
    // re-attempt relay, and kick off a background direct-upgrade attempt for
    // this connection; on relay close, return to the normal backoff path.
    wireTransport(
      channel,
      'relay',
      () => {
        // This relay connection is gone - any retry timer armed against it
        // is moot (a fresh relay open, if one comes, re-triggers directly).
        clearTimeout(directRetryTimerRef.current);
        directRetryTimerRef.current = undefined;
        void handleDisconnect();
      },
      () => { relayTriedRef.current = false; attemptDirectUpgrade(channel); },
    );
    void channel.connect();
  }, [handleDisconnect, wireTransport, attemptDirectUpgrade]);

  // LAN sealed-tunnel transport (Phase 2). A flag-on LAN phone runs the same
  // {t,d} multiplex over a RelayChannel pointed at the local /secure-tunnel
  // (the relay E2E crypto, no cloud hop) instead of the plain /ws - which would
  // carry the session token in the URL. There is NO cleartext LAN fallback: a
  // failed open / no peer-up / peer-down routes to handleDisconnect, and the
  // backoff re-dials the sealed tunnel (connect() picks it again). Like the
  // relay, the sealed channel never carries the 1008 killswitch-revoke close.
  const trySealed = useCallback(async () => {
    if (!mountedRef.current) return;
    const token = await getToken();
    if (!mountedRef.current) return;
    if (!token) { void handleDisconnect(); return; }
    const channel = new RelayChannel(resolveLanSealedWs(), token);
    wsRef.current = channel;
    wireTransport(channel, 'lan-sealed', () => { void handleDisconnect(); });
    void channel.connect();
  }, [handleDisconnect, wireTransport]);

  const connect = useCallback(async () => {
    close();
    setNextAttemptAt(null);
    // Remote origin (e.g. hellonexus.com) with a session token: the LAN /ws
    // resolves to ws://localhost - the phone, not the PC, and unreachable. Skip
    // that doomed open entirely and connect the relay directly. tryRelay() falls
    // back into handleDisconnect() on failure, so backoff still applies.
    if (isRelayActive()) {
      relayTriedRef.current = true;
      void tryRelay();
      return;
    }
    // Flag-on LAN phone: run the multiplex over the local sealed tunnel instead
    // of the token-in-URL /ws. No cloud/cleartext fallback - backoff re-dials it.
    if (isLanSealedActive()) {
      void trySealed();
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
      // Wi-Fi) - fall back to the relay before any backoff. A 1008 close, or a
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
  }, [close, enabled, handleDisconnect, tryRelay, trySealed, wireTransport]);

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

  useEffect(() => {
    if (!wired) return;
    // wsRef holds a CLOSED socket between a drop and the next 500ms dial, so
    // gate on readyState (not nullness) to re-dial when foregrounded.
    const needsReconnect = () => {
      const sock = wsRef.current;
      return !sock || sock.readyState >= WebSocket.CLOSING;
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && needsReconnect()) reconnect();
    };
    const handleFocus = () => {
      if (needsReconnect()) reconnect();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleFocus);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleFocus);
    };
  }, [wired, reconnect]);

  const subscribe = useCallback((topic: string, listener: (data: unknown) => void) => {
    const topics = topicsRef.current;
    let entry = topics.get(topic);
    if (!entry) {
      entry = { refCount: 0, listeners: new Set() };
      topics.set(topic, entry);
    }
    entry.refCount++;
    entry.listeners.add(listener);
    multiplexDiag.listeners++;
    multiplexDiag.topics = topics.size;

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
    multiplexDiag.listeners = Math.max(0, multiplexDiag.listeners - 1);

    if (entry.refCount <= 0) {
      topics.delete(topic);
      multiplexDiag.topics = topics.size;
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
