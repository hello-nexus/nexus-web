import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useMultiplexConnection } from './useMultiplexSocket';

// isRelayActive controls the remote-origin eager-relay branch. Default false
// (the LAN-first tests assume a service-served origin); the remote-origin test
// flips it true. resolveHttp is kept for any indirect import but the hook no
// longer fetches via it directly.
const serviceState = { relayActive: false, lanSealedActive: false };
const setActiveHttpTunnelMock = vi.fn();
vi.mock('../api/service', () => ({
  resolveAuthWs: vi.fn(async (path: string) => `ws://test.local${path}`),
  resolveHttp: vi.fn((path: string) => `http://test.local${path}`),
  resolveRelayWs: vi.fn(() => 'wss://relay.test.local/relay'),
  resolveLanSealedWs: vi.fn(() => 'ws://test.local/secure-tunnel'),
  setActiveTransport: vi.fn(),
  setActiveHttpTunnel: (...args: unknown[]) => setActiveHttpTunnelMock(...args),
  isRelayActive: vi.fn(() => serviceState.relayActive),
  isLanSealedActive: vi.fn(() => serviceState.lanSealedActive),
}));

// handleDisconnect reads the killswitch state through this helper (was a raw
// fetch). Default null = "couldn't reach" so the schedule tests fall through to
// the normal backoff exactly as the old rejecting-fetch mock did.
const remoteControlMock = vi.fn(async () => null as { enabled: boolean } | null);
// handleDisconnect reads the cloud-relay toggle through this helper when the
// dropped connection was a relay transport. Default null = "couldn't reach" so
// non-relay tests fall through to the normal backoff unchanged.
const relayStateMock = vi.fn(async () => null as { enabled: boolean } | null);
vi.mock('../api/panel', () => ({
  fetchPanelRemoteControlState: (...args: unknown[]) => remoteControlMock(...args),
  fetchPanelRelay: (...args: unknown[]) => relayStateMock(...args),
}));

vi.mock('../api/auth', () => ({
  getToken: vi.fn(async () => 'test-token'),
}));

const resetRelayHttpTunnelMock = vi.fn();
vi.mock('../api/relayHttp', () => ({
  resetRelayHttpTunnel: (...args: unknown[]) => resetRelayHttpTunnelMock(...args),
}));

// Controllable fake RelayChannel. By default a relay attempt fails immediately
// (no host on the relay) so the backoff/killswitch tests exercise the LAN path
// exactly as before, with the relay detour resolving fast. Tests that want a
// successful relay flip `relayState.nextPeerUp` true. The class is defined
// inside vi.hoisted so it exists before the (hoisted) vi.mock factory runs.
const { FakeRelayChannel, relayState } = vi.hoisted(() => {
  const relayState = { nextPeerUp: false };
  class FakeRelayChannel {
    // Mirrors RelayChannel's readyState constants - attemptDirectUpgrade
    // compares relayChannel.readyState against RelayChannel.OPEN, and the
    // mock replaces the whole RelayChannel export, so it must carry these too.
    static readonly CONNECTING = 0;
    static readonly OPEN = 1;
    static readonly CLOSING = 2;
    static readonly CLOSED = 3;
    static instances: FakeRelayChannel[] = [];
    onopen: ((e: unknown) => void) | null = null;
    onmessage: ((e: { data: unknown }) => void) | null = null;
    onclose: ((e: { code: number }) => void) | null = null;
    onerror: ((e: unknown) => void) | null = null;
    readyState = 0;
    sent: string[] = [];
    closed = false;
    url: string;
    token: string;
    constructor(url: string, token: string) {
      this.url = url;
      this.token = token;
      FakeRelayChannel.instances.push(this);
    }
    async connect() {
      if (relayState.nextPeerUp) {
        this.readyState = 1;
        this.onopen?.(new Event('open'));
      } else {
        this.readyState = 3;
        this.onclose?.({ code: 1006 });
      }
    }
    send(text: string) { this.sent.push(text); }
    close() {
      if (this.closed) return;
      this.closed = true;
      this.readyState = 3;
      this.onclose?.({ code: 1000 });
    }
  }
  return { FakeRelayChannel, relayState };
});

vi.mock('./relayChannel', () => ({ RelayChannel: FakeRelayChannel }));

// Controllable fake for the WebRTC direct-upgrade layer. openRtcDirectMock is
// configured per test (resolve/reject); FakeDirectChannel mirrors the
// WebSocket-shaped surface RtcRuntimeChannel exposes (readyState constants
// included, since useMultiplexSocket compares against RtcRuntimeChannel.OPEN)
// so wireTransport drives it exactly like a real one. triggerDrop() simulates
// a real drop (channel close / pc failure) distinct from an intentional
// close(), so tests can exercise the revert-to-relay path.
const { FakeDirectChannel, directState, openRtcDirectMock } = vi.hoisted(() => {
  const directState = { eligible: true };
  const openRtcDirectMock = vi.fn();
  class FakeDirectChannel {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;
    readyState = FakeDirectChannel.OPEN;
    onmessage: ((e: { data: unknown }) => void) | null = null;
    onclose: ((e: { code: number }) => void) | null = null;
    onerror: ((e: unknown) => void) | null = null;
    sent: string[] = [];
    // Mirrors the real RtcRuntimeChannel's onopen accessor: the channel is
    // already open by the time openRtcDirect resolves, so assigning onopen
    // (wireTransport's job) must still fire it - asynchronously, same as the
    // real implementation - rather than rely on a 'open' event that already
    // happened.
    private _onopen: ((e: unknown) => void) | null = null;
    get onopen() { return this._onopen; }
    set onopen(handler: ((e: unknown) => void) | null) {
      this._onopen = handler;
      if (handler && this.readyState === FakeDirectChannel.OPEN) {
        queueMicrotask(() => this._onopen === handler && handler({}));
      }
    }
    send(text: string) { this.sent.push(text); }
    close() {
      if (this.readyState === FakeDirectChannel.CLOSED) return;
      this.readyState = FakeDirectChannel.CLOSED;
      this.onclose?.({ code: 1000 });
    }
    triggerDrop(code = 1006) {
      if (this.readyState === FakeDirectChannel.CLOSED) return;
      this.readyState = FakeDirectChannel.CLOSED;
      this.onclose?.({ code });
    }
  }
  return { FakeDirectChannel, directState, openRtcDirectMock };
});

vi.mock('../api/rtcDirect', () => ({
  isRtcDirectEligible: () => directState.eligible,
  openRtcDirect: (...args: unknown[]) => openRtcDirectMock(...args),
  RtcRuntimeChannel: FakeDirectChannel,
}));

// A fresh RtcDirectConnection-shaped object each call: pc is opaque to the
// hook (only .close() on the returned object matters), http is a minimal
// RtcHttpTunnel-shaped stub.
function makeDirectConnection() {
  const runtime = new FakeDirectChannel();
  const http = { request: vi.fn(), close: vi.fn() };
  return { pc: {}, runtime, http, close: vi.fn() };
}

class FakeWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances: FakeWebSocket[] = [];
  readyState = FakeWebSocket.CONNECTING;
  onopen: ((e: unknown) => void) | null = null;
  onclose: ((e: unknown) => void) | null = null;
  onmessage: ((e: unknown) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  url: string;
  sent: string[] = [];

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.(new Event('close'));
  }

  triggerClose(code?: number) {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.(code === undefined ? new Event('close') : Object.assign(new Event('close'), { code }));
  }

  triggerOpen() {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.(new Event('open'));
  }
}

// Flush enough microtask turns to settle the relay detour: a LAN close that
// triggers tryRelay() awaits getToken() (one tick) then RelayChannel.connect()
// (another) before its onclose routes back into handleDisconnect()'s own fetch
// (which rejects in jsdom and falls through to scheduleReconnect).
async function flushRelayDetour() {
  for (let i = 0; i < 8; i++) await Promise.resolve();
}

// handleDisconnect() probes /panel/phone/remote-control to tell a killswitch
// from a transport drop. Mock fetch to reject in a microtask so that probe
// resolves deterministically under fake timers and falls through to the normal
// backoff (killswitchEnabled stays null), keeping the schedule assertions
// stable instead of racing a real network attempt.
function mockRejectingFetch() {
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('no network'))));
}

describe('useMultiplexConnection reconnect schedule', () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
    FakeRelayChannel.instances = [];
    relayState.nextPeerUp = false;
    serviceState.relayActive = false;
    serviceState.lanSealedActive = false;
    remoteControlMock.mockClear();
    remoteControlMock.mockResolvedValue(null);
    mockRejectingFetch();
    vi.useFakeTimers();
    (globalThis as unknown as { WebSocket: typeof FakeWebSocket }).WebSocket = FakeWebSocket;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('uses exponential backoff capped at 60s and resets on a successful open', async () => {
    const { result } = renderHook(() => useMultiplexConnection(true));
    // Allow the initial async resolveAuthWs() to settle.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(FakeWebSocket.instances.length).toBe(1);

    // Sequence of expected delays for closes 1..6: 5s, 10s, 20s, 40s, 60s, 60s.
    const expectedDelays = [5000, 10000, 20000, 40000, 60000, 60000];
    for (const delay of expectedDelays) {
      const lastBeforeClose = FakeWebSocket.instances.length;
      const ws = FakeWebSocket.instances[lastBeforeClose - 1];
      // Use a defined non-revoke close code so the relay detour is taken at
      // most once (first close); after that relayTried is set and closes go
      // straight to backoff.
      await act(async () => {
        ws.triggerClose(1006);
        await flushRelayDetour();
      });
      // Just below the expected delay: no new socket yet.
      await act(async () => {
        vi.advanceTimersByTime(delay - 1);
        await Promise.resolve();
      });
      expect(FakeWebSocket.instances.length).toBe(lastBeforeClose);
      // Crossing the delay triggers a new connect (which awaits resolveAuthWs).
      await act(async () => {
        vi.advanceTimersByTime(1);
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(FakeWebSocket.instances.length).toBe(lastBeforeClose + 1);
    }

    // Successful open resets backoff: next close should schedule at 5s, not 60s.
    const lastWs = FakeWebSocket.instances[FakeWebSocket.instances.length - 1];
    act(() => {
      lastWs.triggerOpen();
    });
    expect(result.current?.connected).toBe(true);
    // A direct /ws open reports the LAN transport.
    expect(result.current?.transport).toBe('lan');

    const beforeReset = FakeWebSocket.instances.length;
    await act(async () => {
      lastWs.triggerClose(1006);
      await flushRelayDetour();
    });
    expect(result.current?.connected).toBe(false);
    // Transport clears to null once the socket closes.
    expect(result.current?.transport).toBe(null);
    await act(async () => {
      vi.advanceTimersByTime(4999);
      await Promise.resolve();
    });
    expect(FakeWebSocket.instances.length).toBe(beforeReset);
    await act(async () => {
      vi.advanceTimersByTime(1);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(FakeWebSocket.instances.length).toBe(beforeReset + 1);
  });

  it('reconnect() resets backoff and reconnects immediately', async () => {
    const { result } = renderHook(() => useMultiplexConnection(true));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(FakeWebSocket.instances.length).toBe(1);

    // Fail twice to advance the schedule.
    for (const delay of [5000, 10000]) {
      const before = FakeWebSocket.instances.length;
      await act(async () => {
        FakeWebSocket.instances[before - 1].triggerClose(1006);
        await flushRelayDetour();
      });
      await act(async () => {
        vi.advanceTimersByTime(delay);
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(FakeWebSocket.instances.length).toBe(before + 1);
    }

    const beforeReconnect = FakeWebSocket.instances.length;
    await act(async () => {
      result.current?.reconnect();
      await Promise.resolve();
      await Promise.resolve();
    });
    // reconnect() short-circuits the pending timer and creates a fresh socket.
    expect(FakeWebSocket.instances.length).toBe(beforeReconnect + 1);
  });
});

describe('useMultiplexConnection relay fallback', () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
    FakeRelayChannel.instances = [];
    relayState.nextPeerUp = false;
    serviceState.relayActive = false;
    serviceState.lanSealedActive = false;
    remoteControlMock.mockClear();
    remoteControlMock.mockResolvedValue(null);
    relayStateMock.mockClear();
    relayStateMock.mockResolvedValue(null);
    mockRejectingFetch();
    vi.useFakeTimers();
    (globalThis as unknown as { WebSocket: typeof FakeWebSocket }).WebSocket = FakeWebSocket;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('parks in relayDisabled when a relay connection drops and the host has the cloud relay OFF, then auto-reconnects on re-enable', async () => {
    // Remote origin: connect straight over the relay and reach peer-up.
    serviceState.relayActive = true;
    relayState.nextPeerUp = true;
    // Killswitch stays ON (Pair Remote is on); only the cloud relay is off.
    remoteControlMock.mockResolvedValue({ enabled: true });
    relayStateMock.mockResolvedValue({ enabled: false });
    const { result } = renderHook(() => useMultiplexConnection(true));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current?.transport).toBe('relay');
    expect(FakeRelayChannel.instances.length).toBe(1);

    // The host turns the cloud relay off → the relay socket closes (non-1008).
    await act(async () => {
      FakeRelayChannel.instances[0].onclose?.({ code: 1006 });
      await flushRelayDetour();
    });
    // The relay toggle read returned {enabled:false}, so we park in relayDisabled
    // (visible popup) and do NOT dial a fresh relay yet.
    expect(result.current?.relayDisabled).toBe(true);
    expect(result.current?.connected).toBe(false);
    expect(FakeRelayChannel.instances.length).toBe(1);

    // Host flips the relay back on. The next slow-poll sees {enabled:true} and
    // reconnects immediately (a fresh relay dial that reaches peer-up).
    relayStateMock.mockResolvedValue({ enabled: true });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
      await flushRelayDetour();
    });
    expect(result.current?.relayDisabled).toBe(false);
    expect(FakeRelayChannel.instances.length).toBe(2);
    expect(result.current?.connected).toBe(true);
    expect(result.current?.transport).toBe('relay');
  });

  it('attempts the relay when the LAN socket closes before opening', async () => {
    renderHook(() => useMultiplexConnection(true));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(FakeWebSocket.instances.length).toBe(1);
    expect(FakeRelayChannel.instances.length).toBe(0);

    await act(async () => {
      FakeWebSocket.instances[0].triggerClose(1006);
      await flushRelayDetour();
    });
    // The LAN open-failure triggered exactly one relay dial.
    expect(FakeRelayChannel.instances.length).toBe(1);
    expect(FakeRelayChannel.instances[0].url).toBe('wss://relay.test.local/relay');
  });

  it('does NOT attempt the relay on a 1008 killswitch-revoke close', async () => {
    renderHook(() => useMultiplexConnection(true));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      // 1008 = PolicyViolation: killswitch / single-device revoke. The relay
      // must never be dialed for this; it routes straight to handleDisconnect.
      FakeWebSocket.instances[0].triggerClose(1008);
      await flushRelayDetour();
    });
    expect(FakeRelayChannel.instances.length).toBe(0);
  });

  it('goes connected via the relay on peer-up and replays subscriptions', async () => {
    relayState.nextPeerUp = true;
    const { result } = renderHook(() => useMultiplexConnection(true));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      FakeWebSocket.instances[0].triggerClose(1006);
      await flushRelayDetour();
    });
    expect(FakeRelayChannel.instances.length).toBe(1);
    expect(result.current?.connected).toBe(true);
    // The open connection runs over the relay, so transport reports 'relay'.
    expect(result.current?.transport).toBe('relay');

    // A multiplex frame arriving over the relay reaches topic subscribers.
    const received: unknown[] = [];
    act(() => { result.current?.subscribe('monitoring', (d) => received.push(d)); });
    // subscribe over the relay should have been sent as a {sub:[...]} text.
    const relay = FakeRelayChannel.instances[0];
    expect(relay.sent.some((s) => s.includes('"sub"') && s.includes('monitoring'))).toBe(true);
    act(() => { relay.onmessage?.({ data: JSON.stringify({ t: 'monitoring', d: { cpu: 42 } }) }); });
    expect(received).toEqual([{ cpu: 42 }]);
  });

  it('on a remote origin (relay active) connects the relay directly, never opening a LAN /ws', async () => {
    // Remote-origin + token: isRelayActive() is true from the very first
    // connect(), so the hook must skip the doomed ws://localhost open and dial
    // the relay straight away. No FakeWebSocket (LAN) instance is created.
    serviceState.relayActive = true;
    relayState.nextPeerUp = true;
    const { result } = renderHook(() => useMultiplexConnection(true));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    // The LAN /ws was never attempted; the relay opened on the first connect.
    expect(FakeWebSocket.instances.length).toBe(0);
    expect(FakeRelayChannel.instances.length).toBe(1);
    expect(FakeRelayChannel.instances[0].url).toBe('wss://relay.test.local/relay');
    expect(result.current?.connected).toBe(true);
    expect(result.current?.transport).toBe('relay');
  });

  it('on a flag-on LAN phone (lan-sealed active) connects the sealed tunnel, never the plain /ws', async () => {
    // isLanSealedActive() is true from the first connect(), so the hook opens a
    // RelayChannel pointed at the LOCAL /secure-tunnel instead of the plain /ws
    // (which would carry the token in the URL). No FakeWebSocket (LAN) instance
    // is created, and the published transport is 'lan-sealed' (not 'relay'), so
    // the cloud-relay satellite indicator stays off.
    serviceState.lanSealedActive = true;
    relayState.nextPeerUp = true;
    const { result } = renderHook(() => useMultiplexConnection(true));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(FakeWebSocket.instances.length).toBe(0);
    expect(FakeRelayChannel.instances.length).toBe(1);
    expect(FakeRelayChannel.instances[0].url).toBe('ws://test.local/secure-tunnel');
    expect(result.current?.connected).toBe(true);
    expect(result.current?.transport).toBe('lan-sealed');
  });
});

describe('useMultiplexConnection direct upgrade', () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
    FakeRelayChannel.instances = [];
    relayState.nextPeerUp = false;
    serviceState.relayActive = false;
    serviceState.lanSealedActive = false;
    directState.eligible = true;
    openRtcDirectMock.mockReset();
    setActiveHttpTunnelMock.mockClear();
    resetRelayHttpTunnelMock.mockClear();
    remoteControlMock.mockClear();
    remoteControlMock.mockResolvedValue(null);
    relayStateMock.mockClear();
    relayStateMock.mockResolvedValue(null);
    mockRejectingFetch();
    vi.useFakeTimers();
    (globalThis as unknown as { WebSocket: typeof FakeWebSocket }).WebSocket = FakeWebSocket;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('hot-swaps to direct after a background punch succeeds off an open relay connection, re-subscribing topics', async () => {
    serviceState.relayActive = true;
    relayState.nextPeerUp = true;
    const conn = makeDirectConnection();
    openRtcDirectMock.mockResolvedValue(conn);

    // Subscribe before anything opens - queued (pendingSubsRef) regardless of
    // which transport ends up live, so this proves resubscription lands on
    // the FINAL (direct) channel without racing the swap's exact timing (the
    // punch can complete within the same tick the relay opens, since none of
    // the mocks here have real async delay).
    const { result } = renderHook(() => useMultiplexConnection(true));
    act(() => { result.current?.subscribe('monitoring', () => {}); });

    await act(async () => { await flushRelayDetour(); });

    expect(openRtcDirectMock).toHaveBeenCalledTimes(1);
    expect(result.current?.transport).toBe('direct');
    expect(result.current?.connected).toBe(true);
    expect(setActiveHttpTunnelMock).toHaveBeenCalledWith(conn.http);
    // The parked REST-over-relay tunnel is torn down - no longer needed once
    // REST routes over the direct http channel instead.
    expect(resetRelayHttpTunnelMock).toHaveBeenCalled();
    // The superseded relay socket is closed, but the swap must not have routed
    // through handleDisconnect (no reconnect/backoff state left behind).
    expect(FakeRelayChannel.instances[0].closed).toBe(true);
    expect(result.current?.sessionRevoked).toBe(false);
    // Re-subscribed (or sent for the first time) onto the direct channel.
    expect(conn.runtime.sent.some((s: string) => s.includes('monitoring'))).toBe(true);
  });

  it('regression: does not swap when the relay channel already dropped while the punch was in flight, and a later close still reaches handleDisconnect', async () => {
    serviceState.relayActive = true;
    relayState.nextPeerUp = true;
    // openRtcDirect never resolves on its own - the test drives it manually so
    // the relay can drop WHILE the punch is still in flight.
    let resolveOpen: (conn: ReturnType<typeof makeDirectConnection>) => void = () => {};
    openRtcDirectMock.mockImplementation(() => new Promise((resolve) => { resolveOpen = resolve; }));

    const { result } = renderHook(() => useMultiplexConnection(true));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current?.transport).toBe('relay');
    expect(openRtcDirectMock).toHaveBeenCalledTimes(1);
    const relayChannel = FakeRelayChannel.instances[0];

    // The relay drops WHILE the punch is still in flight. wsRef still points
    // at this same (now-closed) channel - nothing has replaced it yet - so an
    // identity-only staleness check would miss this.
    await act(async () => {
      relayChannel.close();
      await flushRelayDetour();
    });
    expect(result.current?.connected).toBe(false);
    expect(result.current?.transport).toBe(null);

    // The punch now resolves - the connection must be discarded, not swapped
    // in, since the relay session it was punched alongside is already dead.
    const conn = makeDirectConnection();
    await act(async () => {
      resolveOpen(conn);
      await flushRelayDetour();
    });
    expect(result.current?.transport).not.toBe('direct');
    expect(conn.close).toHaveBeenCalled();
    expect(setActiveHttpTunnelMock).not.toHaveBeenCalled();

    // The original drop's scheduled reconnect proceeds normally (not
    // swallowed) - advancing past the backoff opens a fresh relay connection.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
      await flushRelayDetour();
    });
    expect(result.current?.transport).toBe('relay');
    expect(FakeRelayChannel.instances.length).toBe(2);

    // A later close on this fresh connection still reaches handleDisconnect
    // and schedules a normal reconnect - proves no stale swap-in-progress
    // state is left behind to swallow it (the old boolean flag, once
    // latched, would eat every close from then on regardless of transport).
    await act(async () => {
      FakeRelayChannel.instances[1].close();
      await flushRelayDetour();
    });
    expect(result.current?.connected).toBe(false);
    expect(result.current?.nextAttemptAt).not.toBe(null);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
      await flushRelayDetour();
    });
    expect(FakeRelayChannel.instances.length).toBe(3);
    expect(result.current?.transport).toBe('relay');
  });

  it('resets the re-punch backoff after a successful swap (not carried over from an earlier failed attempt)', async () => {
    serviceState.relayActive = true;
    relayState.nextPeerUp = true;

    // Attempt 1 fails - engages the re-punch backoff at step 1 (a retry would
    // need the DOUBLED 60s if this step were never reset).
    openRtcDirectMock.mockRejectedValueOnce(new Error('offer rejected'));
    const conn = makeDirectConnection();
    // Consumed by the automatic retry once the first 30s backoff elapses.
    openRtcDirectMock.mockResolvedValueOnce(conn);
    const { result } = renderHook(() => useMultiplexConnection(true));
    await act(async () => { await flushRelayDetour(); });
    expect(openRtcDirectMock).toHaveBeenCalledTimes(1);

    // The automatic retry (armed at 30s, the reset value) succeeds and swaps
    // in - no relay drop/reconnect needed to trigger it.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30000);
      await flushRelayDetour();
    });
    expect(openRtcDirectMock).toHaveBeenCalledTimes(2);
    expect(result.current?.transport).toBe('direct');
    expect(FakeRelayChannel.instances.length).toBe(1);

    openRtcDirectMock.mockResolvedValueOnce(makeDirectConnection());
    await act(async () => { conn.runtime.triggerDrop(1006); await flushRelayDetour(); });

    // 29s after this drop: still under the RESET (30s) backoff.
    await act(async () => { await vi.advanceTimersByTimeAsync(29000); });
    await act(async () => { result.current?.reconnect(); await flushRelayDetour(); });
    expect(openRtcDirectMock).toHaveBeenCalledTimes(2);

    // 2s more (31s total since the drop): past the reset 30s backoff - this
    // would still be gated at 31s if the earlier failure's step (needing 60s)
    // had leaked into this cycle instead of being reset on the swap.
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    await act(async () => { result.current?.reconnect(); await flushRelayDetour(); });
    expect(openRtcDirectMock).toHaveBeenCalledTimes(3);
  });

  it('re-triggers the punch for a relay connection that opened while a prior attempt was still in flight', async () => {
    serviceState.relayActive = true;
    relayState.nextPeerUp = true;
    let resolveFirst: (conn: ReturnType<typeof makeDirectConnection>) => void = () => {};
    openRtcDirectMock.mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }));

    const { result } = renderHook(() => useMultiplexConnection(true));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(openRtcDirectMock).toHaveBeenCalledTimes(1);
    const firstRelay = FakeRelayChannel.instances[0];

    // A fresh relay connection opens (e.g. a quick reconnect cycle) while the
    // first punch is still unresolved - it must not be skipped forever.
    await act(async () => {
      result.current?.reconnect();
      await flushRelayDetour();
    });
    const secondRelay = FakeRelayChannel.instances[1];
    expect(secondRelay).not.toBe(firstRelay);
    // Still only the one (first) attempt actually in flight.
    expect(openRtcDirectMock).toHaveBeenCalledTimes(1);

    // The first attempt settles (its own relay is long gone, so it's
    // discarded) - the queued retry for the second connection now fires.
    const secondConn = makeDirectConnection();
    openRtcDirectMock.mockResolvedValueOnce(secondConn);
    await act(async () => {
      resolveFirst(makeDirectConnection());
      await flushRelayDetour();
    });
    expect(openRtcDirectMock).toHaveBeenCalledTimes(2);
    expect(result.current?.transport).toBe('direct');
    // The retry swapped in the SECOND connection (for the still-live relay),
    // not a stray reuse of the first (discarded) one.
    expect(setActiveHttpTunnelMock).toHaveBeenCalledWith(secondConn.http);
  });

  it('leaves the relay connection untouched when the punch attempt fails', async () => {
    serviceState.relayActive = true;
    relayState.nextPeerUp = true;
    openRtcDirectMock.mockRejectedValue(new Error('rtc direct: offer rejected (403)'));

    const { result } = renderHook(() => useMultiplexConnection(true));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current?.transport).toBe('relay');
    const relayChannel = FakeRelayChannel.instances[0];

    await act(async () => { await flushRelayDetour(); });

    expect(openRtcDirectMock).toHaveBeenCalledTimes(1);
    expect(result.current?.transport).toBe('relay');
    expect(result.current?.connected).toBe(true);
    expect(relayChannel.closed).toBe(false);
    expect(setActiveHttpTunnelMock).not.toHaveBeenCalled();
  });

  it('retries a failed punch against the SAME still-open relay connection once the backoff expires, without any relay reconnect', async () => {
    serviceState.relayActive = true;
    relayState.nextPeerUp = true;
    openRtcDirectMock.mockRejectedValueOnce(new Error('rtc direct: offer rejected (403)'));
    const conn = makeDirectConnection();
    openRtcDirectMock.mockResolvedValueOnce(conn);

    const { result } = renderHook(() => useMultiplexConnection(true));
    await act(async () => { await flushRelayDetour(); });
    expect(openRtcDirectMock).toHaveBeenCalledTimes(1);
    expect(result.current?.transport).toBe('relay');
    // The failed punch's relay connection is the ONLY one that ever opens -
    // no relay drop or reconnect happens anywhere in this test.
    expect(FakeRelayChannel.instances.length).toBe(1);
    const relayChannel = FakeRelayChannel.instances[0];

    // 1s before the 30s backoff expires: no retry yet.
    await act(async () => { await vi.advanceTimersByTimeAsync(29000); });
    expect(openRtcDirectMock).toHaveBeenCalledTimes(1);

    // The backoff expires - the retry fires on its own and succeeds.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
      await flushRelayDetour();
    });
    expect(openRtcDirectMock).toHaveBeenCalledTimes(2);
    expect(result.current?.transport).toBe('direct');
    expect(setActiveHttpTunnelMock).toHaveBeenCalledWith(conn.http);
    // Still the one relay connection throughout - the retry never reconnected it.
    expect(FakeRelayChannel.instances.length).toBe(1);
    expect(relayChannel.closed).toBe(true); // closed only as part of the swap
  });

  it('does not retry a failed punch once the rtcDirect killswitch flag latches before the retry fires', async () => {
    serviceState.relayActive = true;
    relayState.nextPeerUp = true;
    openRtcDirectMock.mockRejectedValueOnce(new Error('rtc direct: offer rejected (403)'));

    const { result } = renderHook(() => useMultiplexConnection(true));
    await act(async () => { await flushRelayDetour(); });
    expect(openRtcDirectMock).toHaveBeenCalledTimes(1);
    // The relay connection stays open throughout - only the timer fire itself
    // (not a close) is what re-evaluates attemptDirectUpgrade's guards here.
    expect(FakeRelayChannel.instances.length).toBe(1);
    expect(result.current?.transport).toBe('relay');

    // The flag flips off while the retry is pending - the retry timer still
    // fires at the backoff mark, but attemptDirectUpgrade's own eligibility
    // guard bails before ever calling openRtcDirect again.
    directState.eligible = false;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30000);
      await flushRelayDetour();
    });
    expect(openRtcDirectMock).toHaveBeenCalledTimes(1);
    expect(result.current?.transport).toBe('relay');
  });

  it('does not retry a failed punch once the killswitch/relay-off terminal states latch (via the relay drop that sets them, which also clears the timer)', async () => {
    serviceState.relayActive = true;
    relayState.nextPeerUp = true;
    openRtcDirectMock.mockRejectedValueOnce(new Error('rtc direct: offer rejected (403)'));

    const { result } = renderHook(() => useMultiplexConnection(true));
    await act(async () => { await flushRelayDetour(); });
    expect(openRtcDirectMock).toHaveBeenCalledTimes(1);
    const relayChannel = FakeRelayChannel.instances[0];

    // The only way remoteDisabled/relayDisabled/sessionRevoked latch is via a
    // transport close reaching handleDisconnect - and that same close already
    // clears the pending retry timer (see tryRelay's onClose). Killswitch off
    // while Pair Remote itself stays reachable enough to answer the poll.
    remoteControlMock.mockResolvedValue({ enabled: false });
    await act(async () => {
      relayChannel.close();
      await flushRelayDetour();
    });
    expect(result.current?.remoteDisabled).toBe(true);

    // Advancing well past the original 30s backoff never fires a stray retry
    // for the now-dead relay connection - the timer was cleared on close.
    await act(async () => { await vi.advanceTimersByTimeAsync(30000); });
    expect(openRtcDirectMock).toHaveBeenCalledTimes(1);
  });

  it('reverts to the relay path on a direct drop and backs off the next punch attempt', async () => {
    serviceState.relayActive = true;
    relayState.nextPeerUp = true;
    openRtcDirectMock.mockImplementation(async () => makeDirectConnection());

    const { result } = renderHook(() => useMultiplexConnection(true));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => { await flushRelayDetour(); });
    expect(result.current?.transport).toBe('direct');
    // mockImplementation is async, so the recorded call result is the Promise.
    const firstConn = await (openRtcDirectMock.mock.results[0].value as Promise<ReturnType<typeof makeDirectConnection>>);

    // The direct channel drops (e.g. an ICE failure).
    await act(async () => {
      firstConn.runtime.triggerDrop(1006);
      await flushRelayDetour();
    });
    expect(result.current?.connected).toBe(false);
    expect(result.current?.transport).toBe(null);

    // The existing reconnect machinery brings a fresh relay connection back up
    // at the normal 5s backoff start.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
      await flushRelayDetour();
    });
    expect(result.current?.transport).toBe('relay');
    // Re-punch backoff (30s) hasn't elapsed yet - no second attempt.
    expect(openRtcDirectMock).toHaveBeenCalledTimes(1);

    // Advance well past the 30s direct-upgrade backoff, then force a fresh
    // relay connection (reconnect()) - the punch is retried this time.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(26000);
    });
    await act(async () => {
      result.current?.reconnect();
      await flushRelayDetour();
    });
    expect(openRtcDirectMock).toHaveBeenCalledTimes(2);
  });

  it('parks in relayDisabled when a DIRECT connection drops and the host has the cloud relay OFF', async () => {
    serviceState.relayActive = true;
    relayState.nextPeerUp = true;
    const conn = makeDirectConnection();
    openRtcDirectMock.mockResolvedValue(conn);

    const { result } = renderHook(() => useMultiplexConnection(true));
    await act(async () => { await flushRelayDetour(); });
    expect(result.current?.transport).toBe('direct');

    // Killswitch (Pair Remote) stays ON; only the cloud relay is off. A direct
    // session descends from a relay one, so its drop must probe the same
    // relay-off state as a plain relay drop would - otherwise the phone loops
    // the normal backoff forever with no "relay turned off" explanation.
    remoteControlMock.mockResolvedValue({ enabled: true });
    relayStateMock.mockResolvedValue({ enabled: false });

    await act(async () => {
      conn.runtime.triggerDrop(1006);
      await flushRelayDetour();
    });

    expect(result.current?.relayDisabled).toBe(true);
    expect(result.current?.connected).toBe(false);
  });

  it('never attempts a punch when the rtcDirect killswitch flag is off', async () => {
    serviceState.relayActive = true;
    relayState.nextPeerUp = true;
    directState.eligible = false;

    const { result } = renderHook(() => useMultiplexConnection(true));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current?.transport).toBe('relay');

    await act(async () => { await flushRelayDetour(); });

    expect(openRtcDirectMock).not.toHaveBeenCalled();
  });

  it('never attempts a punch on a wired/kiosk surface even when relay is active', async () => {
    serviceState.relayActive = true;
    relayState.nextPeerUp = true;

    const { result } = renderHook(() => useMultiplexConnection(true, true));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current?.transport).toBe('relay');

    await act(async () => { await flushRelayDetour(); });

    expect(openRtcDirectMock).not.toHaveBeenCalled();
  });

  it('never attempts a punch when the live transport is the plain LAN socket', async () => {
    const { result } = renderHook(() => useMultiplexConnection(true));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    act(() => { FakeWebSocket.instances[0].triggerOpen(); });
    expect(result.current?.transport).toBe('lan');

    await act(async () => { await flushRelayDetour(); });

    expect(openRtcDirectMock).not.toHaveBeenCalled();
  });
});
