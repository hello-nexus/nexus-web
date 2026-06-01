import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  DIR_CLIENT_TO_HOST,
  DIR_HOST_TO_CLIENT,
  deriveAeadKey,
  derivePairRoot,
  open as openFrame,
  seal,
} from '../api/relayCrypto';

// End-to-end pair-over-relay flow: a brand-new phone with NO LAN reachability
// pairs over the cloud relay, the minted session token is persisted via the
// real auth storage, and the runtime multiplex connection then starts over the
// relay using THAT token (rid derived from the session token, not the pair
// token). This stitches together internetPairing + auth + useMultiplexSocket
// with mocks only at the socket + LAN-claim boundaries.

const PAIR_TOKEN = 'PAIRTOK-abcdef0123456789';
const SESSION_TOKEN = 'SESS-relay-from-claim';

function b64urlToBytes(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// Mock relay/host socket used ONLY for the pair claim handshake (the runtime
// relay is driven through a separate FakeRelayChannel below, matching how
// useMultiplexSocket consumes it).
class MockClaimSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  readyState = MockClaimSocket.CONNECTING;
  binaryType = 'arraybuffer';
  onopen: ((e: Event) => void) | null = null;
  onmessage: ((e: MessageEvent) => void) | null = null;
  onclose: ((e: CloseEvent) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
  salt = '';
  constructor(public url: string) {
    setTimeout(() => { this.readyState = MockClaimSocket.OPEN; this.onopen?.(new Event('open')); }, 0);
  }
  send(data: string | ArrayBuffer): void {
    if (typeof data === 'string') {
      this.salt = (JSON.parse(data) as { salt: string }).salt;
      setTimeout(() => this.onmessage?.(new MessageEvent('message', { data: JSON.stringify({ e: 'peer-up' }) })), 0);
      return;
    }
    void this.reply(new Uint8Array(data));
  }
  private async reply(frame: Uint8Array): Promise<void> {
    const key = await deriveAeadKey(await derivePairRoot(PAIR_TOKEN), b64urlToBytes(this.salt));
    const opened = await openFrame(key, frame);
    expect(opened.dir).toBe(DIR_CLIENT_TO_HOST);
    const out = await seal(key, DIR_HOST_TO_CLIENT, 0,
      JSON.stringify({ type: 'claim-ok', sessionToken: SESSION_TOKEN, machineName: 'PC' }));
    const buf = new ArrayBuffer(out.byteLength);
    new Uint8Array(buf).set(out);
    this.onmessage?.(new MessageEvent('message', { data: buf }));
  }
  close(): void { this.readyState = MockClaimSocket.CLOSED; }
}

// Runtime relay channel fake: records the token it was constructed with so the
// test can assert the runtime connects with the just-stored SESSION token.
const { FakeRelayChannel } = vi.hoisted(() => {
  class FakeRelayChannel {
    static instances: FakeRelayChannel[] = [];
    onopen: ((e: unknown) => void) | null = null;
    onmessage: ((e: { data: unknown }) => void) | null = null;
    onclose: ((e: { code: number }) => void) | null = null;
    onerror: ((e: unknown) => void) | null = null;
    readyState = 0;
    constructor(public url: string, public token: string) { FakeRelayChannel.instances.push(this); }
    async connect() { this.readyState = 1; this.onopen?.(new Event('open')); }
    send() {}
    close() { this.readyState = 3; this.onclose?.({ code: 1000 }); }
  }
  return { FakeRelayChannel };
});

// LAN claim is unreachable for a brand-new off-network phone.
const lanClaimMock = vi.fn(async () => null);
vi.mock('../api/panel', () => ({
  claimPanelPhonePairingLan: (...args: unknown[]) => lanClaimMock(...args),
}));

vi.mock('../api/service', () => ({
  resolveRelayWs: () => 'wss://relay.test/relay',
  resolveAuthWs: async (path: string) => `ws://test.local${path}`,
  resolveHttp: (path: string) => `http://test.local${path}`,
}));

// Runtime transport uses the mocked relay channel; the pair claim uses the raw
// WebSocket global. Keep auth REAL so storePhoneToken → getToken is exercised.
vi.mock('./relayChannel', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./relayChannel')>();
  return { ...actual, RelayChannel: FakeRelayChannel };
});

import { pairOverInternet } from '../api/internetPairing';
import { useMultiplexConnection } from './useMultiplexSocket';
import { clearToken } from '../api/auth';

class FakeLanWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances: FakeLanWebSocket[] = [];
  readyState = FakeLanWebSocket.CONNECTING;
  onopen: ((e: unknown) => void) | null = null;
  onclose: ((e: unknown) => void) | null = null;
  onmessage: ((e: unknown) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  constructor(public url: string) { FakeLanWebSocket.instances.push(this); }
  send() {}
  close() { this.readyState = FakeLanWebSocket.CLOSED; this.onclose?.(new Event('close')); }
  triggerClose(code: number) {
    this.readyState = FakeLanWebSocket.CLOSED;
    this.onclose?.(Object.assign(new Event('close'), { code }));
  }
}

async function flush() { for (let i = 0; i < 10; i++) await Promise.resolve(); }

beforeEach(() => {
  clearToken();
  localStorage.clear();
  lanClaimMock.mockClear();
  FakeRelayChannel.instances = [];
  FakeLanWebSocket.instances = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('relay pair flow → token stored → runtime starts over relay', () => {
  it('claims over the relay, persists the session token, then the runtime relay connects with it', async () => {
    // 1. Pair over the relay (LAN unreachable). Uses the raw WebSocket global
    // for the claim handshake.
    vi.stubGlobal('WebSocket', MockClaimSocket as unknown as typeof WebSocket);
    const pairResult = await pairOverInternet({
      host: '10.0.0.9', httpPort: '9400', pairToken: PAIR_TOKEN, deviceName: 'iPhone',
    });
    expect(pairResult.kind).toBe('relay');

    // 2. The session token is now persisted under this origin (real auth).
    expect(localStorage.getItem('nexus_token')).toBe(SESSION_TOKEN);
    expect(localStorage.getItem('nexus_phone_token')).toBe(SESSION_TOKEN);

    // 3. Runtime starts: mount the multiplex connection. The LAN /ws fails to
    // open (off-network) → relay fallback. Assert the runtime RelayChannel was
    // constructed with the just-stored SESSION token.
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('no network'))));
    (globalThis as unknown as { WebSocket: typeof FakeLanWebSocket }).WebSocket = FakeLanWebSocket;

    const { result } = renderHook(() => useMultiplexConnection(true));
    await act(async () => { await flush(); });
    expect(FakeLanWebSocket.instances.length).toBe(1);

    await act(async () => {
      FakeLanWebSocket.instances[0].triggerClose(1006); // LAN unreachable
      await flush();
    });

    expect(FakeRelayChannel.instances.length).toBe(1);
    expect(FakeRelayChannel.instances[0].token).toBe(SESSION_TOKEN);
    expect(FakeRelayChannel.instances[0].url).toBe('wss://relay.test/relay');
    expect(result.current?.connected).toBe(true);

    vi.useRealTimers();
  });
});
