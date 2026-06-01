import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useMultiplexConnection } from './useMultiplexSocket';

vi.mock('../api/service', () => ({
  resolveAuthWs: vi.fn(async (path: string) => `ws://test.local${path}`),
  resolveHttp: vi.fn((path: string) => `http://test.local${path}`),
  resolveRelayWs: vi.fn(() => 'wss://relay.test.local/relay'),
  setActiveTransport: vi.fn(),
}));

vi.mock('../api/auth', () => ({
  getToken: vi.fn(async () => 'test-token'),
}));

// Controllable fake RelayChannel. By default a relay attempt fails immediately
// (no host on the relay) so the backoff/killswitch tests exercise the LAN path
// exactly as before, with the relay detour resolving fast. Tests that want a
// successful relay flip `relayState.nextPeerUp` true. The class is defined
// inside vi.hoisted so it exists before the (hoisted) vi.mock factory runs.
const { FakeRelayChannel, relayState } = vi.hoisted(() => {
  const relayState = { nextPeerUp: false };
  class FakeRelayChannel {
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
    mockRejectingFetch();
    vi.useFakeTimers();
    (globalThis as unknown as { WebSocket: typeof FakeWebSocket }).WebSocket = FakeWebSocket;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
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
});
