// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DIR_CLIENT_TO_HOST,
  DIR_HOST_TO_CLIENT,
  deriveAeadKey,
  deriveHttpRid,
  deriveRelayRoot,
  open as openFrame,
  seal,
} from './relayCrypto';
import { relayFetch, resetRelayHttpTunnel } from './relayHttp';

// Exercises the REST-over-relay tunnel against a mock relay/host: the relay
// performs the wire handshake (hello → peer-up), then the host opens each
// sealed request, asserts the rid_http rendezvous + request framing, and
// answers with a sealed response matched by id. Proves relayFetch resolves a
// fetch-like result, multiplexes concurrent ids, and rebuilds on close.

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
// client hello it replies peer-up; on each sealed request it decrypts, records
// it, then optionally replies with a sealed response built by a per-test
// responder. dir on receive must be client→host; replies are host→client.
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

  readyState = MockRelaySocket.CONNECTING;
  binaryType = 'arraybuffer';
  onopen: ((e: Event) => void) | null = null;
  onmessage: ((e: MessageEvent) => void) | null = null;
  onclose: ((e: CloseEvent) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
  rid = '';
  salt = '';
  recvCounter = 0;

  constructor(public url: string) {
    MockRelaySocket.instances.push(this);
    setTimeout(() => { this.readyState = MockRelaySocket.OPEN; this.onopen?.(new Event('open')); }, 0);
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
    void this.handleSealedRequest(new Uint8Array(data));
  }

  private async handleSealedRequest(frame: Uint8Array): Promise<void> {
    const key = await deriveAeadKey(await deriveRelayRoot(TOKEN), b64urlToBytes(this.salt));
    const opened = await openFrame(key, frame);
    expect(opened.dir).toBe(DIR_CLIENT_TO_HOST);
    const req = JSON.parse(opened.plaintext) as HostRequest;
    const reply = await MockRelaySocket.responder(req);
    if (!reply) return; // swallow → exercises request timeout
    const out = await seal(key, DIR_HOST_TO_CLIENT, this.recvCounter++, JSON.stringify(reply));
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
