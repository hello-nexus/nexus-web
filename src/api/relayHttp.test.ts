// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DIR_CLIENT_TO_HOST,
  DIR_HOST_TO_CLIENT,
  REKEY_HELLO2,
  base64UrlNoPad,
  deriveAeadKey,
  deriveHttpRid,
  deriveRekeyedAeadKey,
  deriveRelayRoot,
  open as openFrame,
  seal,
} from './relayCrypto';
import { relayFetch, resetRelayHttpTunnel } from './relayHttp';

// Exercises the REST-over-relay tunnel against a mock relay/host: the relay
// performs the wire handshake (hello → peer-up), then the host plays the v2
// hello2/hn rekey (the default MockRelaySocket.hostMode) before dispatching
// sealed requests and answering with a sealed response matched by id. Proves
// relayFetch resolves a fetch-like result, multiplexes concurrent ids,
// rebuilds on close, and falls back to K0 for a legacy (v1) host.

const TOKEN = 'test-session-token-0123456789';
const RELAY_URL = 'wss://relay.test/relay';

function b64urlToBytes(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

interface HostRequest {
  id: number;
  method: string;
  path: string;
  body: string | null;
  contentType: string | null;
}

// A WebSocket-shaped mock that plays both the relay and the PC host: on the
// client hello it replies peer-up; on each sealed frame it decrypts, records
// it, then either plays the v2 hello2/hn rekey or replies to a request with a
// sealed response built by a per-test responder. dir on receive must be
// client→host; replies are host→client.
class MockRelaySocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances: MockRelaySocket[] = [];
  // Per-test hook: given the decrypted request, return the response object to
  // seal back, or null to swallow it (e.g. to test timeouts / closes).
  static responder: (req: HostRequest) => Promise<{ id: number; status: number; body: string; contentType: string | null } | null> = async (req) => ({
    id: req.id,
    status: 200,
    body: JSON.stringify({ ok: true, path: req.path, method: req.method }),
    contentType: 'application/json',
  });
  // The control frame the mock relay returns for the client hello. Defaults to
  // peer-up; a test flips it to no-host to exercise the fast-fail path.
  static helloControl: Record<string, unknown> = { e: 'peer-up' };
  static lastHello: Record<string, unknown> | null = null;
  // v2 (default): answers hello2 with a sealed hn frame under K0 and rekeys to
  // K1 for everything after. legacy-403: answers hello2 with a sealed
  // {id:0,status:403} under K0 and never rekeys (a v1 host's generic answer to
  // an unparseable request). silent: never answers hello2 at all (also a v1
  // host - its runtime/http leg sends nothing unprompted) - exercises the
  // REKEY_TIMEOUT_MS fallback.
  static hostMode: 'v2' | 'legacy-403' | 'silent' = 'v2';
  // Every sealed frame this mock received, decrypted and in arrival order -
  // lets a test assert the exact client→host sequence (hello2 first, K1
  // counters restarting at 0, etc.) without reaching into RelayHttpTunnel.
  static receivedFrames: Array<{ dir: number; counter: number; plaintext: string }> = [];

  readyState = MockRelaySocket.CONNECTING;
  binaryType = 'arraybuffer';
  onopen: ((e: Event) => void) | null = null;
  onmessage: ((e: MessageEvent) => void) | null = null;
  onclose: ((e: CloseEvent) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
  rid = '';
  salt = '';
  recvCounter = 0;
  private k0: CryptoKey | null = null;
  private k1: CryptoKey | null = null;
  private hostNonce: Uint8Array | null = null;

  constructor(public url: string) {
    MockRelaySocket.instances.push(this);
    setTimeout(() => { this.readyState = MockRelaySocket.OPEN; this.onopen?.(new Event('open')); }, 0);
  }

  async deriveK0(): Promise<CryptoKey> {
    if (!this.k0) this.k0 = await deriveAeadKey(await deriveRelayRoot(TOKEN), b64urlToBytes(this.salt));
    return this.k0;
  }

  private async deriveK1(): Promise<CryptoKey> {
    if (!this.k1) {
      this.hostNonce = crypto.getRandomValues(new Uint8Array(16));
      this.k1 = await deriveRekeyedAeadKey(await deriveRelayRoot(TOKEN), b64urlToBytes(this.salt), this.hostNonce);
    }
    return this.k1;
  }

  send(data: string | ArrayBuffer): void {
    if (typeof data === 'string') {
      const hello = JSON.parse(data) as { rid: string; role: string; salt: string };
      this.rid = hello.rid;
      this.salt = hello.salt;
      MockRelaySocket.lastHello = hello as Record<string, unknown>;
      setTimeout(() => this.onmessage?.(new MessageEvent('message', { data: JSON.stringify(MockRelaySocket.helloControl) })), 0);
      return;
    }
    void this.handleSealedFrame(new Uint8Array(data));
  }

  private async handleSealedFrame(frame: Uint8Array): Promise<void> {
    const key = this.k1 ?? await this.deriveK0();
    const opened = await openFrame(key, frame);
    expect(opened.dir).toBe(DIR_CLIENT_TO_HOST);
    MockRelaySocket.receivedFrames.push(opened);

    if (opened.plaintext === REKEY_HELLO2) {
      await this.handleHello2();
      return;
    }

    const req = JSON.parse(opened.plaintext) as HostRequest;
    const reply = await MockRelaySocket.responder(req);
    if (!reply) return; // swallow → exercises request timeout
    await this.sendSealed(reply);
  }

  private async handleHello2(): Promise<void> {
    if (MockRelaySocket.hostMode === 'silent') return;
    if (MockRelaySocket.hostMode === 'legacy-403') {
      await this.sendSealed({ id: 0, status: 403, body: '', contentType: null }, await this.deriveK0());
      return;
    }
    const k0 = await this.deriveK0();
    await this.deriveK1();
    await this.sendSealed({ c: 'hn', hn: base64UrlNoPad(this.hostNonce!) }, k0);
  }

  /** Seal and deliver a response frame; defaults to whichever key this mock currently holds (K1 once rekeyed, else K0). */
  async sendSealed(payload: object, key?: CryptoKey): Promise<void> {
    const useKey = key ?? this.k1 ?? await this.deriveK0();
    const out = await seal(useKey, DIR_HOST_TO_CLIENT, this.recvCounter++, JSON.stringify(payload));
    const buf = new ArrayBuffer(out.byteLength);
    new Uint8Array(buf).set(out);
    this.onmessage?.(new MessageEvent('message', { data: buf }));
  }

  close(): void {
    if (this.readyState === MockRelaySocket.CLOSED) return;
    this.readyState = MockRelaySocket.CLOSED;
    this.onclose?.(Object.assign(new Event('close'), { code: 1000 }) as CloseEvent);
  }
}

beforeEach(() => {
  resetRelayHttpTunnel();
  MockRelaySocket.instances = [];
  MockRelaySocket.helloControl = { e: 'peer-up' };
  MockRelaySocket.lastHello = null;
  MockRelaySocket.hostMode = 'v2';
  MockRelaySocket.receivedFrames = [];
  MockRelaySocket.responder = async (req) => ({
    id: req.id,
    status: 200,
    body: JSON.stringify({ ok: true, path: req.path, method: req.method }),
    contentType: 'application/json',
  });
  vi.stubGlobal('WebSocket', MockRelaySocket as unknown as typeof WebSocket);
});

afterEach(() => {
  resetRelayHttpTunnel();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('relayFetch (REST-over-relay tunnel)', () => {
  it('opens the tunnel on rid_http and resolves a sealed response for a GET', async () => {
    const res = await relayFetch(TOKEN, RELAY_URL, 'GET', '/panel/devices');
    expect(res.status).toBe(200);
    expect(res.contentType).toBe('application/json');
    expect(JSON.parse(res.body)).toEqual({ ok: true, path: '/panel/devices', method: 'GET' });

    // The single tunnel connection rendezvoused on rid_http, not the runtime rid.
    const expectedRidHttp = await deriveHttpRid(await deriveRelayRoot(TOKEN));
    expect(MockRelaySocket.instances).toHaveLength(1);
    expect(MockRelaySocket.instances[0].rid).toBe(expectedRidHttp);
  });

  it('forwards the method/path/body/contentType in the sealed request frame', async () => {
    let seen: HostRequest | null = null;
    MockRelaySocket.responder = async (req) => {
      seen = req;
      return { id: req.id, status: 204, body: '', contentType: null };
    };
    const res = await relayFetch(TOKEN, RELAY_URL, 'POST', '/panel/profile', JSON.stringify({ a: 1 }), 'application/json');
    expect(res.status).toBe(204);
    expect(seen).not.toBeNull();
    expect(seen!.method).toBe('POST');
    expect(seen!.path).toBe('/panel/profile');
    expect(seen!.body).toBe(JSON.stringify({ a: 1 }));
    expect(seen!.contentType).toBe('application/json');
  });

  it('multiplexes concurrent requests, matching each response by id', async () => {
    // Reply out of arrival order so a correct impl must match strictly by id.
    MockRelaySocket.responder = async (req) => ({
      id: req.id,
      status: 200,
      body: JSON.stringify({ path: req.path }),
      contentType: 'application/json',
    });
    const [a, b, c] = await Promise.all([
      relayFetch(TOKEN, RELAY_URL, 'GET', '/panel/a'),
      relayFetch(TOKEN, RELAY_URL, 'GET', '/panel/b'),
      relayFetch(TOKEN, RELAY_URL, 'GET', '/panel/c'),
    ]);
    expect(JSON.parse(a.body)).toEqual({ path: '/panel/a' });
    expect(JSON.parse(b.body)).toEqual({ path: '/panel/b' });
    expect(JSON.parse(c.body)).toEqual({ path: '/panel/c' });
    // All three rode the SAME lazily-opened tunnel.
    expect(MockRelaySocket.instances).toHaveLength(1);
  });

  it('opts in with nh:1 and fails fast when the relay reports no-host', async () => {
    MockRelaySocket.helloControl = { e: 'no-host' };
    // The PC isn't on the relay: the tunnel must reject rather than wait out the
    // peer-up timeout, so the /ping that drives the offline overlay resolves now.
    await expect(relayFetch(TOKEN, RELAY_URL, 'GET', '/ping')).rejects.toThrow();
    expect(MockRelaySocket.lastHello?.nh).toBe(1);
  });

  it('reuses the single tunnel across sequential requests', async () => {
    await relayFetch(TOKEN, RELAY_URL, 'GET', '/panel/one');
    await relayFetch(TOKEN, RELAY_URL, 'GET', '/panel/two');
    expect(MockRelaySocket.instances).toHaveLength(1);
  });

  it('rejects in-flight requests and rebuilds the tunnel after a channel close', async () => {
    // First request opens the tunnel; then the channel closes → next request
    // must open a FRESH tunnel rather than reuse the dead one.
    await relayFetch(TOKEN, RELAY_URL, 'GET', '/panel/first');
    expect(MockRelaySocket.instances).toHaveLength(1);
    MockRelaySocket.instances[0].close();
    await relayFetch(TOKEN, RELAY_URL, 'GET', '/panel/second');
    expect(MockRelaySocket.instances).toHaveLength(2);
  });

  it('resetRelayHttpTunnel actually closes the parked socket, not just the reference (self-heals on the next relayFetch)', async () => {
    await relayFetch(TOKEN, RELAY_URL, 'GET', '/panel/first');
    expect(MockRelaySocket.instances).toHaveLength(1);
    const parked = MockRelaySocket.instances[0];
    expect(parked.readyState).toBe(MockRelaySocket.OPEN);

    resetRelayHttpTunnel();
    expect(parked.readyState).toBe(MockRelaySocket.CLOSED);

    // A fresh tunnel opens lazily on the next call - not an orphaned reuse of
    // the (now-closed, unreachable) parked socket.
    const res = await relayFetch(TOKEN, RELAY_URL, 'GET', '/panel/second');
    expect(res.status).toBe(200);
    expect(MockRelaySocket.instances).toHaveLength(2);
    expect(MockRelaySocket.instances[1]).not.toBe(parked);
  });
});

describe('relayFetch v2 in-band rekey', () => {
  it('seals {"c":"hello2"} under K0 as the first frame, then the first real request under K1 counter 0', async () => {
    const res = await relayFetch(TOKEN, RELAY_URL, 'GET', '/panel/devices');
    expect(res.status).toBe(200);

    expect(MockRelaySocket.receivedFrames).toHaveLength(2);
    expect(MockRelaySocket.receivedFrames[0]).toMatchObject({ dir: DIR_CLIENT_TO_HOST, counter: 0, plaintext: REKEY_HELLO2 });
    expect(MockRelaySocket.receivedFrames[1].dir).toBe(DIR_CLIENT_TO_HOST);
    expect(MockRelaySocket.receivedFrames[1].counter).toBe(0); // K1 counters restart at 0
    const req = JSON.parse(MockRelaySocket.receivedFrames[1].plaintext) as HostRequest;
    expect(req.path).toBe('/panel/devices');
  });

  it('tears the tunnel down on a response sealed under the superseded K0 after rekey', async () => {
    await relayFetch(TOKEN, RELAY_URL, 'GET', '/panel/first'); // opens the tunnel and rekeys to K1
    expect(MockRelaySocket.instances).toHaveLength(1);
    const inst = MockRelaySocket.instances[0];

    const staleK0 = await inst.deriveK0();
    const frame = await seal(staleK0, DIR_HOST_TO_CLIENT, 99, JSON.stringify({ id: 0, status: 200, body: '"stale"', contentType: null }));
    const buf = new ArrayBuffer(frame.byteLength);
    new Uint8Array(buf).set(frame);
    inst.onmessage?.(new MessageEvent('message', { data: buf }));

    // Tag-verify fails under K1 ⇒ the tunnel dies (async decrypt) ⇒ wait for
    // that teardown to finish before the next relayFetch opens a fresh one.
    for (let i = 0; i < 10 && inst.readyState !== MockRelaySocket.CLOSED; i++) {
      await new Promise((r) => setTimeout(r, 0));
    }
    expect(inst.readyState).toBe(MockRelaySocket.CLOSED);

    const res = await relayFetch(TOKEN, RELAY_URL, 'GET', '/panel/second');
    expect(res.status).toBe(200);
    expect(MockRelaySocket.instances).toHaveLength(2);
  });

  it('ignores a sealed response whose id matches no pending request, without tearing the tunnel down', async () => {
    await relayFetch(TOKEN, RELAY_URL, 'GET', '/panel/first');
    expect(MockRelaySocket.instances).toHaveLength(1);
    const inst = MockRelaySocket.instances[0];

    await inst.sendSealed({ id: 999999, status: 200, body: '"orphan"', contentType: null });

    const res = await relayFetch(TOKEN, RELAY_URL, 'GET', '/panel/second');
    expect(res.status).toBe(200);
    expect(MockRelaySocket.instances).toHaveLength(1); // same tunnel, never torn down
  });

  it('falls back to K0 when the host answers hello2 with a legacy 403/id:0 response, and completes the real request over K0', async () => {
    MockRelaySocket.hostMode = 'legacy-403';
    const res = await relayFetch(TOKEN, RELAY_URL, 'GET', '/panel/devices');
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ ok: true, path: '/panel/devices', method: 'GET' });

    expect(MockRelaySocket.receivedFrames).toHaveLength(2);
    expect(MockRelaySocket.receivedFrames[0].plaintext).toBe(REKEY_HELLO2);
    // Counter continues from 1 - 0 under K0 was already spent by hello2 and
    // must never be reused for the real request under the same key.
    expect(MockRelaySocket.receivedFrames[1].counter).toBe(1);
  });

  it('falls back to K0 after REKEY_TIMEOUT_MS when a legacy host never answers hello2 at all', async () => {
    vi.useFakeTimers();
    MockRelaySocket.hostMode = 'silent';

    const promise = relayFetch(TOKEN, RELAY_URL, 'GET', '/panel/devices');
    // Each crypto.subtle-backed await (key derivation, seal) needs its own
    // small pump round under fake timers, so advance in small steps rather
    // than one lump REKEY_TIMEOUT_MS jump - a step taken before the rekey
    // fallback timer is even armed wouldn't count toward it.
    for (let i = 0; i < 40; i++) await vi.advanceTimersByTimeAsync(100); // 4000ms total, well past REKEY_TIMEOUT_MS

    const res = await promise;
    expect(res.status).toBe(200);
    expect(MockRelaySocket.receivedFrames[0].plaintext).toBe(REKEY_HELLO2);
    expect(MockRelaySocket.receivedFrames[1].counter).toBe(1); // continues from hello2's 0, never reused
  });

  it('tears the tunnel down when an hn frame arrives after the handshake already settled (key desync)', async () => {
    await relayFetch(TOKEN, RELAY_URL, 'GET', '/panel/first'); // opens the tunnel and rekeys to K1
    expect(MockRelaySocket.instances).toHaveLength(1);
    const inst = MockRelaySocket.instances[0];

    await inst.sendSealed({ c: 'hn', hn: 'yQ' });
    for (let i = 0; i < 10 && inst.readyState !== MockRelaySocket.CLOSED; i++) {
      await new Promise((r) => setTimeout(r, 0));
    }
    expect(inst.readyState).toBe(MockRelaySocket.CLOSED);

    // The old tunnel is dead; the next relayFetch opens a fresh one.
    const res = await relayFetch(TOKEN, RELAY_URL, 'GET', '/panel/second');
    expect(res.status).toBe(200);
    expect(MockRelaySocket.instances).toHaveLength(2);
  });

  it('rejects the pending request when the hn field is not valid base64url', async () => {
    MockRelaySocket.hostMode = 'silent';
    const pending = relayFetch(TOKEN, RELAY_URL, 'GET', '/panel/devices');
    for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0));
    expect(MockRelaySocket.instances).toHaveLength(1);
    const inst = MockRelaySocket.instances[0];

    // A validly-sealed frame (tag verifies) whose hn value is not base64url.
    await inst.sendSealed({ c: 'hn', hn: '!!!not base64!!!' }, await inst.deriveK0());

    await expect(pending).rejects.toThrow();
  });

  it('RelayHttpTunnel.die() during the handshake wait rejects a queued request()', async () => {
    MockRelaySocket.hostMode = 'silent';
    const pending = relayFetch(TOKEN, RELAY_URL, 'GET', '/panel/devices');
    for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0));
    expect(MockRelaySocket.instances).toHaveLength(1);

    MockRelaySocket.instances[0].close();

    await expect(pending).rejects.toThrow();
  });
});
