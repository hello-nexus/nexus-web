import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DIR_CLIENT_TO_HOST,
  DIR_HOST_TO_CLIENT,
  REKEY_HELLO2,
  base64UrlDecode,
  base64UrlNoPad,
  deriveAeadKey,
  deriveRekeyedAeadKey,
  deriveRelayRoot,
  open as openFrame,
  seal,
} from './relayCrypto';

// Exercises the two RTCDataChannel wrappers (RtcRuntimeChannel, RtcHttpTunnel)
// directly against a scriptable fake channel - no real WebRTC involved - plus
// the openRtcDirect handshake against a fake RTCPeerConnection. The sealed
// framing must interop byte-for-byte with the relay path, so the KAT vector is
// the SAME one relayCrypto.test.ts locks (dir=1 counter=0 host->client). Both
// wrappers run the same hello2/hn rekey as the relay path (relayChannel.test.ts,
// relayHttp.test.ts) once their data channel opens - driveRekeyToK1 walks that
// handshake for tests that need the channel past it.

const authFetchWithStatusMock = vi.hoisted(() => vi.fn());
vi.mock('./service', () => ({
  authFetchWithStatus: (...args: unknown[]) => authFetchWithStatusMock(...args),
}));

import { openRtcDirect, isRtcDirectEligible, RtcRuntimeChannel, RtcHttpTunnel } from './rtcDirect';

const KAT = {
  token: 'test-session-token-0123456789',
  connSalt: '000102030405060708090a0b0c0d0e0f',
  plaintext: '{"t":"ping","d":1}',
  frame: '010000000000000000000000b62dce75421fdfc7760de887f5675c9f1aba87de074f45dc48f1bd17e54d146b70b3',
};

function fromHex(s: string): Uint8Array {
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const out = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(out).set(bytes);
  return out;
}

// Minimal RTCDataChannel double. `on*` property assignment (used internally by
// the wrappers under test) and addEventListener (used by openRtcDirect's
// waitForChannelOpen) are kept in sync by routing both through emit().
class FakeDataChannel {
  readyState: 'connecting' | 'open' | 'closing' | 'closed' = 'connecting';
  binaryType = 'blob';
  bufferedAmount = 0;
  onopen: ((e: Event) => void) | null = null;
  onclose: ((e: Event) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
  onmessage: ((e: MessageEvent) => void) | null = null;
  sent: ArrayBuffer[] = [];
  private readonly listeners = new Map<string, Set<(e: Event) => void>>();

  constructor(public label: string) {}

  addEventListener(type: string, cb: (e: Event) => void): void {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(cb);
  }

  removeEventListener(type: string, cb: (e: Event) => void): void {
    this.listeners.get(type)?.delete(cb);
  }

  send(data: ArrayBuffer): void {
    this.sent.push(data);
  }

  close(): void {
    if (this.readyState === 'closed') return;
    this.readyState = 'closed';
    this.emit('close', this.onclose);
  }

  simulateOpen(): void {
    this.readyState = 'open';
    this.emit('open', this.onopen);
  }

  simulateMessage(data: ArrayBuffer): void {
    const evt = new MessageEvent('message', { data });
    this.onmessage?.(evt);
    for (const cb of this.listeners.get('message') ?? []) cb(evt);
  }

  private emit(type: string, prop: ((e: Event) => void) | null): void {
    const evt = new Event(type);
    prop?.(evt);
    for (const cb of this.listeners.get(type) ?? []) cb(evt);
  }
}

async function deriveTestRoot(): Promise<Uint8Array> {
  return deriveRelayRoot(KAT.token);
}

async function deriveTestKey(): Promise<CryptoKey> {
  const root = await deriveTestRoot();
  return deriveAeadKey(root, fromHex(KAT.connSalt));
}

// Yield real macrotask turns (not just microtasks) so a chained WebCrypto call
// (seal/open, both genuinely async under jsdom's webcrypto shim) has settled
// before the assertion reads its result.
async function flushAsync(ticks = 8): Promise<void> {
  for (let i = 0; i < ticks; i++) {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
}

// Walks a channel through the v2 rekey handshake as a v2 host would: reads
// dc.sent[0] as the client's sealed hello2 under K0, replies with a sealed
// {"c":"hn",...} frame, and returns the resulting K1 (+ the hostNonce used).
// Leaves dc.sent === [hello2] - subsequent sends land at dc.sent[1]...
async function driveRekeyToK1(dc: FakeDataChannel, k0: CryptoKey, root: Uint8Array, connSalt: Uint8Array): Promise<{ k1: CryptoKey; hostNonce: Uint8Array }> {
  await flushAsync();
  expect(dc.sent).toHaveLength(1);
  const hello = await openFrame(k0, new Uint8Array(dc.sent[0]));
  expect(hello.dir).toBe(DIR_CLIENT_TO_HOST);
  expect(hello.counter).toBe(0);
  expect(hello.plaintext).toBe(REKEY_HELLO2);

  const hostNonce = crypto.getRandomValues(new Uint8Array(16));
  const hnFrame = await seal(k0, DIR_HOST_TO_CLIENT, 0, JSON.stringify({ c: 'hn', hn: base64UrlNoPad(hostNonce) }));
  dc.simulateMessage(toArrayBuffer(hnFrame));
  await flushAsync();

  const k1 = await deriveRekeyedAeadKey(root, connSalt, hostNonce);
  return { k1, hostNonce };
}

describe('RtcRuntimeChannel sealed framing', () => {
  it('falls back to K0 when the first frame is not hn (a legacy host): delivered normally, KAT interop preserved', async () => {
    const key = await deriveTestKey();
    const dc = new FakeDataChannel('runtime');
    dc.readyState = 'open';
    const onFatal = vi.fn();
    const channel = new RtcRuntimeChannel(dc as unknown as RTCDataChannel, await deriveTestRoot(), fromHex(KAT.connSalt), key, onFatal);
    const opened = vi.fn();
    channel.onopen = opened;
    const received: string[] = [];
    channel.onmessage = (e) => received.push(e.data as string);

    await flushAsync();
    expect(dc.sent).toHaveLength(1); // hello2, awaiting the host's reply

    // The KAT frame is real multiplex data (not an hn reply) - a legacy host's
    // answer, delivered as-is while the channel stays on K0.
    dc.simulateMessage(toArrayBuffer(fromHex(KAT.frame)));
    await flushAsync();

    expect(received).toEqual([KAT.plaintext]);
    expect(opened).toHaveBeenCalledTimes(1);
    expect(channel.readyState).toBe(RtcRuntimeChannel.OPEN);
    expect(onFatal).not.toHaveBeenCalled();
  });

  it('seals hello2 under K0 first, then rekeys to K1 and seals outbound sends with an incrementing counter from 0', async () => {
    const k0 = await deriveTestKey();
    const root = await deriveTestRoot();
    const connSalt = fromHex(KAT.connSalt);
    const dc = new FakeDataChannel('runtime');
    dc.readyState = 'open';
    const channel = new RtcRuntimeChannel(dc as unknown as RTCDataChannel, root, connSalt, k0, vi.fn());
    const { k1 } = await driveRekeyToK1(dc, k0, root, connSalt);

    channel.send('{"sub":["monitoring"]}');
    channel.send('{"sub":["lighting"]}');
    await flushAsync();
    await flushAsync();

    expect(dc.sent).toHaveLength(3); // [0] hello2 under K0, [1..2] under K1
    const first = await openFrame(k1, new Uint8Array(dc.sent[1]));
    const second = await openFrame(k1, new Uint8Array(dc.sent[2]));
    expect(first.dir).toBe(DIR_CLIENT_TO_HOST);
    expect(first.counter).toBe(0); // K1 counters restart at 0
    expect(first.plaintext).toBe('{"sub":["monitoring"]}');
    expect(second.counter).toBe(1);
    expect(second.plaintext).toBe('{"sub":["lighting"]}');
  });

  it('accepts a host frame under K1 counter 0 after rekey, and rejects one sealed under the superseded K0', async () => {
    const k0 = await deriveTestKey();
    const root = await deriveTestRoot();
    const connSalt = fromHex(KAT.connSalt);
    const dc = new FakeDataChannel('runtime');
    dc.readyState = 'open';
    const onFatal = vi.fn();
    const channel = new RtcRuntimeChannel(dc as unknown as RTCDataChannel, root, connSalt, k0, onFatal);
    const received: string[] = [];
    channel.onmessage = (e) => received.push(e.data as string);
    const { k1 } = await driveRekeyToK1(dc, k0, root, connSalt);

    const k1Frame = await seal(k1, DIR_HOST_TO_CLIENT, 0, '{"t":"monitoring","d":{}}');
    dc.simulateMessage(toArrayBuffer(k1Frame));
    await flushAsync();
    expect(received).toEqual(['{"t":"monitoring","d":{}}']);
    expect(onFatal).not.toHaveBeenCalled();

    // A frame sealed under the superseded K0 fails tag-verify under K1.
    const staleK0Frame = await seal(k0, DIR_HOST_TO_CLIENT, 1, '{"t":"stale","d":{}}');
    dc.simulateMessage(toArrayBuffer(staleK0Frame));
    await flushAsync();
    expect(received).toEqual(['{"t":"monitoring","d":{}}']);
    expect(onFatal).toHaveBeenCalledTimes(1);
  });

  it('onFatal fires when an hn frame arrives after the handshake already settled (key desync)', async () => {
    const k0 = await deriveTestKey();
    const root = await deriveTestRoot();
    const connSalt = fromHex(KAT.connSalt);
    const dc = new FakeDataChannel('runtime');
    dc.readyState = 'open';
    const onFatal = vi.fn();
    const channel = new RtcRuntimeChannel(dc as unknown as RTCDataChannel, root, connSalt, k0, onFatal);
    const received: string[] = [];
    channel.onmessage = (e) => received.push(e.data as string);
    const { k1 } = await driveRekeyToK1(dc, k0, root, connSalt);

    // The host apparently switched keys again after settling on K1 - an
    // unrecoverable desync, not a second rekey.
    const lateHn = await seal(k1, DIR_HOST_TO_CLIENT, 0, JSON.stringify({ c: 'hn', hn: 'yQ' }));
    dc.simulateMessage(toArrayBuffer(lateHn));
    await flushAsync();

    expect(received).toEqual([]);
    expect(onFatal).toHaveBeenCalledTimes(1);
  });

  it('closes the connection when the hn field is not valid base64url', async () => {
    const key = await deriveTestKey();
    const dc = new FakeDataChannel('runtime');
    dc.readyState = 'open';
    const onFatal = vi.fn();
    const channel = new RtcRuntimeChannel(dc as unknown as RTCDataChannel, await deriveTestRoot(), fromHex(KAT.connSalt), key, onFatal);
    const opened = vi.fn();
    channel.onopen = opened;

    await flushAsync();
    // A validly-sealed frame (tag verifies) whose hn value is not base64url.
    const badHn = await seal(key, DIR_HOST_TO_CLIENT, 0, JSON.stringify({ c: 'hn', hn: '!!!not base64!!!' }));
    dc.simulateMessage(toArrayBuffer(badHn));
    await flushAsync();

    expect(opened).not.toHaveBeenCalled();
    expect(onFatal).toHaveBeenCalledTimes(1);
  });

  it('falls back to K0 after REKEY_TIMEOUT_MS with no host reply at all', async () => {
    vi.useFakeTimers();
    try {
      const k0 = await deriveTestKey();
      const dc = new FakeDataChannel('runtime');
      dc.readyState = 'open';
      const channel = new RtcRuntimeChannel(dc as unknown as RTCDataChannel, await deriveTestRoot(), fromHex(KAT.connSalt), k0, vi.fn());
      const opened = vi.fn();
      channel.onopen = opened;

      for (let i = 0; i < 40; i++) await vi.advanceTimersByTimeAsync(100); // well past REKEY_TIMEOUT_MS
      expect(opened).toHaveBeenCalledTimes(1);
      expect(channel.readyState).toBe(RtcRuntimeChannel.OPEN);

      channel.send('{"sub":["monitoring"]}');
      for (let i = 0; i < 10; i++) await vi.advanceTimersByTimeAsync(0);
      expect(dc.sent).toHaveLength(2); // [0] hello2, [1] the app's first send under K0
      const sent = await openFrame(k0, new Uint8Array(dc.sent[1]));
      expect(sent.counter).toBe(1); // 0 was hello2, never reused
    } finally {
      vi.useRealTimers();
    }
  });

  it('closes the connection on a tampered first frame instead of falling back', async () => {
    const key = await deriveTestKey();
    const dc = new FakeDataChannel('runtime');
    dc.readyState = 'open';
    const onFatal = vi.fn();
    const channel = new RtcRuntimeChannel(dc as unknown as RTCDataChannel, await deriveTestRoot(), fromHex(KAT.connSalt), key, onFatal);
    const opened = vi.fn();
    channel.onopen = opened;

    await flushAsync();
    const tampered = new Uint8Array(await seal(key, DIR_HOST_TO_CLIENT, 0, JSON.stringify({ c: 'hn', hn: 'x' })));
    tampered[tampered.byteLength - 1] ^= 0xff;
    dc.simulateMessage(toArrayBuffer(tampered));
    await flushAsync();

    expect(opened).not.toHaveBeenCalled();
    expect(onFatal).toHaveBeenCalledTimes(1);
  });

  it('processes inbound frames in delivery order even when their decrypts would settle out of order', async () => {
    // dc.onmessage fires once per delivered frame, but AEAD decrypt is async;
    // without serializing handleMessage, a slow-to-decrypt earlier frame could
    // have its monotonic-counter check run AFTER a faster later frame already
    // advanced lastRecvCounter, misfiring onFatal on legitimate traffic. Gate
    // the FIRST decrypt call to prove the second frame's decrypt is never even
    // attempted until the first frame's handling has fully completed. Frame0
    // (a legacy first frame, not hn) also resolves the rekey handshake, so
    // frame1 exercises the normal post-handshake path.
    const key = await deriveTestKey();
    const dc = new FakeDataChannel('runtime');
    dc.readyState = 'open';
    const onFatal = vi.fn();
    const channel = new RtcRuntimeChannel(dc as unknown as RTCDataChannel, await deriveTestRoot(), fromHex(KAT.connSalt), key, onFatal);
    const received: string[] = [];
    channel.onmessage = (e) => received.push(e.data as string);
    await flushAsync(); // past hello2

    const frame0 = await seal(key, DIR_HOST_TO_CLIENT, 0, '{"t":"a","d":1}');
    const frame1 = await seal(key, DIR_HOST_TO_CLIENT, 1, '{"t":"b","d":2}');

    const realDecrypt = crypto.subtle.decrypt.bind(crypto.subtle);
    let decryptCalls = 0;
    let releaseFirst: () => void = () => {};
    const gate = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const spy = vi.spyOn(crypto.subtle, 'decrypt').mockImplementation(async (...args: Parameters<typeof realDecrypt>) => {
      decryptCalls++;
      if (decryptCalls === 1) await gate;
      return realDecrypt(...args);
    });

    try {
      dc.simulateMessage(toArrayBuffer(frame0));
      dc.simulateMessage(toArrayBuffer(frame1));
      await flushAsync();

      // frame1's decrypt must not have started while frame0's is gated.
      expect(decryptCalls).toBe(1);
      expect(received).toEqual([]);

      releaseFirst();
      await flushAsync();

      expect(decryptCalls).toBe(2);
      expect(received).toEqual(['{"t":"a","d":1}', '{"t":"b","d":2}']);
      expect(onFatal).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it('rejects a replayed/non-increasing counter and closes the connection', async () => {
    const key = await deriveTestKey();
    const dc = new FakeDataChannel('runtime');
    dc.readyState = 'open';
    const onFatal = vi.fn();
    const channel = new RtcRuntimeChannel(dc as unknown as RTCDataChannel, await deriveTestRoot(), fromHex(KAT.connSalt), key, onFatal);
    const received: string[] = [];
    channel.onmessage = (e) => received.push(e.data as string);

    // A non-hn first frame both resolves the handshake (legacy K0) and is the
    // "a" delivery below.
    const frame0 = await seal(key, DIR_HOST_TO_CLIENT, 0, '{"t":"a","d":1}');
    dc.simulateMessage(toArrayBuffer(frame0));
    await flushAsync();
    // Replay the same counter - must be rejected, not delivered.
    dc.simulateMessage(toArrayBuffer(frame0));
    await flushAsync();

    expect(received).toEqual(['{"t":"a","d":1}']);
    expect(onFatal).toHaveBeenCalledTimes(1);
  });

  it('rejects a frame in the wrong direction (client->host reflected back) as the first frame', async () => {
    const key = await deriveTestKey();
    const dc = new FakeDataChannel('runtime');
    dc.readyState = 'open';
    const onFatal = vi.fn();
    const channel = new RtcRuntimeChannel(dc as unknown as RTCDataChannel, await deriveTestRoot(), fromHex(KAT.connSalt), key, onFatal);
    const received: string[] = [];
    channel.onmessage = (e) => received.push(e.data as string);

    const wrongDir = await seal(key, DIR_CLIENT_TO_HOST, 0, '{"t":"a","d":1}');
    dc.simulateMessage(toArrayBuffer(wrongDir));
    await flushAsync();

    expect(received).toEqual([]);
    expect(onFatal).toHaveBeenCalledTimes(1);
  });

  it('onopen fires (async) when assigned after the handshake already resolved the channel to OPEN', async () => {
    const key = await deriveTestKey();
    const dc = new FakeDataChannel('runtime');
    dc.readyState = 'open'; // already open before the wrapper is constructed
    const channel = new RtcRuntimeChannel(dc as unknown as RTCDataChannel, await deriveTestRoot(), fromHex(KAT.connSalt), key, vi.fn());

    // Resolve the handshake (legacy fallback) before onopen is ever assigned.
    await flushAsync();
    dc.simulateMessage(toArrayBuffer(fromHex(KAT.frame)));
    await flushAsync();
    expect(channel.readyState).toBe(RtcRuntimeChannel.OPEN);

    const opened = vi.fn();
    channel.onopen = opened;
    expect(opened).not.toHaveBeenCalled(); // not synchronous
    await flushAsync();
    expect(opened).toHaveBeenCalledTimes(1);
  });

  it('onopen only fires once the channel opens AND the rekey handshake resolves', async () => {
    const key = await deriveTestKey();
    const dc = new FakeDataChannel('runtime');
    const channel = new RtcRuntimeChannel(dc as unknown as RTCDataChannel, await deriveTestRoot(), fromHex(KAT.connSalt), key, vi.fn());
    const opened = vi.fn();
    channel.onopen = opened;
    expect(opened).not.toHaveBeenCalled();

    dc.simulateOpen();
    expect(opened).not.toHaveBeenCalled(); // raw open only starts the handshake
    await flushAsync();
    expect(dc.sent).toHaveLength(1); // hello2
    expect(opened).not.toHaveBeenCalled(); // still awaiting the host's reply

    dc.simulateMessage(toArrayBuffer(fromHex(KAT.frame))); // legacy fallback
    await flushAsync();
    expect(opened).toHaveBeenCalledTimes(1);
    expect(channel.readyState).toBe(RtcRuntimeChannel.OPEN);
  });

  it('close() is idempotent and fires onclose once, even mid-handshake', async () => {
    const key = await deriveTestKey();
    const dc = new FakeDataChannel('runtime');
    dc.readyState = 'open';
    const channel = new RtcRuntimeChannel(dc as unknown as RTCDataChannel, await deriveTestRoot(), fromHex(KAT.connSalt), key, vi.fn());
    const closed = vi.fn();
    channel.onclose = closed;

    channel.close();
    channel.close();

    expect(closed).toHaveBeenCalledTimes(1);
    expect(channel.readyState).toBe(RtcRuntimeChannel.CLOSED);
  });

  it('a throwing onmessage consumer triggers onFatal instead of silently poisoning later frames', async () => {
    const key = await deriveTestKey();
    const dc = new FakeDataChannel('runtime');
    dc.readyState = 'open';
    const onFatal = vi.fn();
    const channel = new RtcRuntimeChannel(dc as unknown as RTCDataChannel, await deriveTestRoot(), fromHex(KAT.connSalt), key, onFatal);
    // Without a .catch() on the chained handleMessage promise, this throw
    // would leave the internal chain permanently rejected - .then() on a
    // rejected promise skips every later handler, so no frame after this one
    // would ever be processed again.
    channel.onmessage = () => { throw new Error('consumer bug'); };

    const frame0 = await seal(key, DIR_HOST_TO_CLIENT, 0, '{"t":"a","d":1}');
    dc.simulateMessage(toArrayBuffer(frame0));
    await flushAsync();

    expect(onFatal).toHaveBeenCalledTimes(1);
  });
});

describe('RtcHttpTunnel', () => {
  it('seals hello2 under K0 first, then rekeys to K1 and seals the real request under K1 counter 0', async () => {
    const k0 = await deriveTestKey();
    const root = await deriveTestRoot();
    const connSalt = fromHex(KAT.connSalt);
    const dc = new FakeDataChannel('http');
    dc.readyState = 'open';
    const tunnel = new RtcHttpTunnel(dc as unknown as RTCDataChannel, root, connSalt, k0, vi.fn());
    const { k1 } = await driveRekeyToK1(dc, k0, root, connSalt);

    const pending = tunnel.request('GET', '/panel/devices', null, null);
    await flushAsync();
    expect(dc.sent).toHaveLength(2); // [0] hello2 under K0, [1] the real request under K1
    const req = await openFrame(k1, new Uint8Array(dc.sent[1]));
    expect(req.dir).toBe(DIR_CLIENT_TO_HOST);
    expect(req.counter).toBe(0); // K1 counters restart at 0
    const parsedReq = JSON.parse(req.plaintext) as { id: number; method: string; path: string };
    expect(parsedReq.method).toBe('GET');
    expect(parsedReq.path).toBe('/panel/devices');

    const replyFrame = await seal(k1, DIR_HOST_TO_CLIENT, 0, JSON.stringify({
      id: parsedReq.id, status: 200, body: '{"ok":true}', contentType: 'application/json', base64: false,
    }));
    dc.simulateMessage(toArrayBuffer(replyFrame));

    const res = await pending;
    expect(res.status).toBe(200);
    expect(res.body).toBe('{"ok":true}');
  });

  it('multiplexes concurrent requests under K1, matching replies out of order by id', async () => {
    const k0 = await deriveTestKey();
    const root = await deriveTestRoot();
    const connSalt = fromHex(KAT.connSalt);
    const dc = new FakeDataChannel('http');
    dc.readyState = 'open';
    const tunnel = new RtcHttpTunnel(dc as unknown as RTCDataChannel, root, connSalt, k0, vi.fn());
    const { k1 } = await driveRekeyToK1(dc, k0, root, connSalt);

    const first = tunnel.request('GET', '/panel/a', null, null);
    const second = tunnel.request('GET', '/panel/b', null, null);
    await flushAsync();
    await flushAsync();
    expect(dc.sent).toHaveLength(3); // hello2 + two requests

    const reqA = await openFrame(k1, new Uint8Array(dc.sent[1]));
    const reqB = await openFrame(k1, new Uint8Array(dc.sent[2]));
    const idA = (JSON.parse(reqA.plaintext) as { id: number }).id;
    const idB = (JSON.parse(reqB.plaintext) as { id: number }).id;

    // Reply to B first, then A - a correct impl matches strictly by id.
    const replyB = await seal(k1, DIR_HOST_TO_CLIENT, 0, JSON.stringify({ id: idB, status: 200, body: '"b"', contentType: null, base64: false }));
    dc.simulateMessage(toArrayBuffer(replyB));
    const replyA = await seal(k1, DIR_HOST_TO_CLIENT, 1, JSON.stringify({ id: idA, status: 200, body: '"a"', contentType: null, base64: false }));
    dc.simulateMessage(toArrayBuffer(replyA));

    expect(await first).toMatchObject({ body: '"a"' });
    expect(await second).toMatchObject({ body: '"b"' });
  });

  it('rejects a response sealed under the superseded K0 after rekey (onFatal), without resolving the request', async () => {
    const k0 = await deriveTestKey();
    const root = await deriveTestRoot();
    const connSalt = fromHex(KAT.connSalt);
    const dc = new FakeDataChannel('http');
    dc.readyState = 'open';
    // onFatal only NOTIFIES the caller (see RtcHttpTunnel.handleMessage) - the
    // caller (openRtcDirect's teardown, in production) is the one that closes
    // the tunnel and rejects pending requests. Mirror that wiring here.
    const onFatal = vi.fn(() => tunnel.close());
    const tunnel = new RtcHttpTunnel(dc as unknown as RTCDataChannel, root, connSalt, k0, onFatal);
    await driveRekeyToK1(dc, k0, root, connSalt);

    const pending = tunnel.request('GET', '/panel/devices', null, null).catch((e: Error) => e);
    await flushAsync();
    const staleFrame = await seal(k0, DIR_HOST_TO_CLIENT, 5, JSON.stringify({ id: 0, status: 200, body: '"stale"', contentType: null, base64: false }));
    dc.simulateMessage(toArrayBuffer(staleFrame));
    await flushAsync();

    expect(onFatal).toHaveBeenCalledTimes(1);
    expect(await pending).toBeInstanceOf(Error);
  });

  it('onFatal fires when an hn frame arrives after the handshake already settled (key desync)', async () => {
    const k0 = await deriveTestKey();
    const root = await deriveTestRoot();
    const connSalt = fromHex(KAT.connSalt);
    const dc = new FakeDataChannel('http');
    dc.readyState = 'open';
    const onFatal = vi.fn(() => tunnel.close());
    const tunnel = new RtcHttpTunnel(dc as unknown as RTCDataChannel, root, connSalt, k0, onFatal);
    const { k1 } = await driveRekeyToK1(dc, k0, root, connSalt);

    const pending = tunnel.request('GET', '/panel/devices', null, null).catch((e: Error) => e);
    await flushAsync();

    // The host apparently switched keys again after settling on K1 - an
    // unrecoverable desync, not a second rekey.
    const lateHn = await seal(k1, DIR_HOST_TO_CLIENT, 0, JSON.stringify({ c: 'hn', hn: 'yQ' }));
    dc.simulateMessage(toArrayBuffer(lateHn));
    await flushAsync();

    expect(onFatal).toHaveBeenCalledTimes(1);
    expect(await pending).toBeInstanceOf(Error);
  });

  it('falls back to K0 when the first frame is not hn (a legacy host), sealing the real request under K0 counter 1', async () => {
    const k0 = await deriveTestKey();
    const root = await deriveTestRoot();
    const connSalt = fromHex(KAT.connSalt);
    const dc = new FakeDataChannel('http');
    dc.readyState = 'open';
    const tunnel = new RtcHttpTunnel(dc as unknown as RTCDataChannel, root, connSalt, k0, vi.fn());

    await flushAsync();
    expect(dc.sent).toHaveLength(1);
    const hello = await openFrame(k0, new Uint8Array(dc.sent[0]));
    expect(hello.plaintext).toBe(REKEY_HELLO2);

    // A legacy host's generic answer to an unparseable request: id:0, 403.
    const legacyReply = await seal(k0, DIR_HOST_TO_CLIENT, 0, JSON.stringify({ id: 0, status: 403, body: '', contentType: null, base64: false }));
    dc.simulateMessage(toArrayBuffer(legacyReply));
    await flushAsync();

    const pending = tunnel.request('GET', '/panel/devices', null, null);
    await flushAsync();
    expect(dc.sent).toHaveLength(2);
    const req = await openFrame(k0, new Uint8Array(dc.sent[1]));
    expect(req.counter).toBe(1); // 0 was hello2 under the same K0, never reused

    const parsedReq = JSON.parse(req.plaintext) as { id: number };
    const replyFrame = await seal(k0, DIR_HOST_TO_CLIENT, 1, JSON.stringify({ id: parsedReq.id, status: 200, body: '"ok"', contentType: null, base64: false }));
    dc.simulateMessage(toArrayBuffer(replyFrame));
    expect(await pending).toMatchObject({ status: 200, body: '"ok"' });
  });

  it('falls back to K0 after REKEY_TIMEOUT_MS when the host never answers hello2 at all', async () => {
    vi.useFakeTimers();
    try {
      const k0 = await deriveTestKey();
      const dc = new FakeDataChannel('http');
      dc.readyState = 'open';
      const tunnel = new RtcHttpTunnel(dc as unknown as RTCDataChannel, await deriveTestRoot(), fromHex(KAT.connSalt), k0, vi.fn());

      const pending = tunnel.request('GET', '/panel/devices', null, null);
      for (let i = 0; i < 40; i++) await vi.advanceTimersByTimeAsync(100); // well past REKEY_TIMEOUT_MS

      expect(dc.sent).toHaveLength(2); // [0] hello2, [1] the real request, both under K0
      const req = await openFrame(k0, new Uint8Array(dc.sent[1]));
      expect(req.counter).toBe(1); // continues from hello2's 0, never reused

      const parsedReq = JSON.parse(req.plaintext) as { id: number };
      const replyFrame = await seal(k0, DIR_HOST_TO_CLIENT, 1, JSON.stringify({ id: parsedReq.id, status: 200, body: '"ok"', contentType: null, base64: false }));
      dc.simulateMessage(toArrayBuffer(replyFrame));
      for (let i = 0; i < 10; i++) await vi.advanceTimersByTimeAsync(0);
      expect(await pending).toMatchObject({ status: 200, body: '"ok"' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects a new request as busy when bufferedAmount is over the backpressure threshold', async () => {
    const k0 = await deriveTestKey();
    const root = await deriveTestRoot();
    const connSalt = fromHex(KAT.connSalt);
    const dc = new FakeDataChannel('http');
    dc.readyState = 'open';
    const tunnel = new RtcHttpTunnel(dc as unknown as RTCDataChannel, root, connSalt, k0, vi.fn());
    await driveRekeyToK1(dc, k0, root, connSalt);

    dc.bufferedAmount = 8 * 1024 * 1024; // over the 4MB guard
    await expect(tunnel.request('GET', '/panel/devices', null, null)).rejects.toThrow(/busy/);
    expect(dc.sent).toHaveLength(1); // still just hello2 - the busy request was never sent
  });

  it('rejects an oversized request without ever sending it', async () => {
    const k0 = await deriveTestKey();
    const root = await deriveTestRoot();
    const connSalt = fromHex(KAT.connSalt);
    const dc = new FakeDataChannel('http');
    dc.readyState = 'open';
    const tunnel = new RtcHttpTunnel(dc as unknown as RTCDataChannel, root, connSalt, k0, vi.fn());
    await driveRekeyToK1(dc, k0, root, connSalt);

    const hugeBody = 'x'.repeat(300 * 1024); // exceeds the 256KB frame cap once sealed
    await expect(tunnel.request('POST', '/panel/media', hugeBody, 'application/octet-stream')).rejects.toThrow(/large/);
    expect(dc.sent).toHaveLength(1); // still just hello2
  });

  it('rejects immediately when the channel is not open', async () => {
    const key = await deriveTestKey();
    const dc = new FakeDataChannel('http'); // readyState stays 'connecting'
    const tunnel = new RtcHttpTunnel(dc as unknown as RTCDataChannel, await deriveTestRoot(), fromHex(KAT.connSalt), key, vi.fn());

    await expect(tunnel.request('GET', '/panel/devices', null, null)).rejects.toThrow();
    expect(dc.sent).toHaveLength(0);
  });

  it('ignores a sealed response whose id matches no pending request, without disturbing a real in-flight one', async () => {
    const k0 = await deriveTestKey();
    const root = await deriveTestRoot();
    const connSalt = fromHex(KAT.connSalt);
    const dc = new FakeDataChannel('http');
    dc.readyState = 'open';
    const onFatal = vi.fn();
    const tunnel = new RtcHttpTunnel(dc as unknown as RTCDataChannel, root, connSalt, k0, onFatal);
    const { k1 } = await driveRekeyToK1(dc, k0, root, connSalt);

    const pending = tunnel.request('GET', '/panel/devices', null, null);
    await flushAsync();
    const req = await openFrame(k1, new Uint8Array(dc.sent[1]));
    const realId = (JSON.parse(req.plaintext) as { id: number }).id;

    // An orphan response (an id that was never registered) arrives first.
    const orphan = await seal(k1, DIR_HOST_TO_CLIENT, 0, JSON.stringify({ id: 999999, status: 200, body: '"orphan"', contentType: null, base64: false }));
    dc.simulateMessage(toArrayBuffer(orphan));
    await flushAsync();
    expect(onFatal).not.toHaveBeenCalled();

    const real = await seal(k1, DIR_HOST_TO_CLIENT, 1, JSON.stringify({ id: realId, status: 200, body: '"ok"', contentType: null, base64: false }));
    dc.simulateMessage(toArrayBuffer(real));
    expect(await pending).toMatchObject({ status: 200, body: '"ok"' });
  });

  it('close() rejects in-flight requests awaiting the handshake', async () => {
    const key = await deriveTestKey();
    const dc = new FakeDataChannel('http');
    dc.readyState = 'open';
    const tunnel = new RtcHttpTunnel(dc as unknown as RTCDataChannel, await deriveTestRoot(), fromHex(KAT.connSalt), key, vi.fn());

    const pending = tunnel.request('GET', '/panel/devices', null, null);
    await flushAsync();
    tunnel.close();

    await expect(pending).rejects.toThrow();
  });

  it('rejects a tampered first frame (tag verify fails, onFatal), never resolving the request', async () => {
    const key = await deriveTestKey();
    const dc = new FakeDataChannel('http');
    dc.readyState = 'open';
    const onFatal = vi.fn();
    const tunnel = new RtcHttpTunnel(dc as unknown as RTCDataChannel, await deriveTestRoot(), fromHex(KAT.connSalt), key, onFatal);

    tunnel.request('GET', '/panel/devices', null, null).catch(() => {});
    await flushAsync();
    const frame = await seal(key, DIR_HOST_TO_CLIENT, 0, JSON.stringify({ id: 0, status: 200, body: '{}', contentType: null, base64: false }));
    frame[frame.byteLength - 1] ^= 0xff;
    dc.simulateMessage(toArrayBuffer(frame));
    await flushAsync();

    expect(onFatal).toHaveBeenCalledTimes(1);
  });
});

// openRtcDirect: the offer/answer handshake against a fake RTCPeerConnection.
// The fake defaults iceGatheringState to 'complete' so tests don't need to
// choreograph ICE gathering explicitly.
class FakePeerConnection {
  static instances: FakePeerConnection[] = [];
  connectionState = 'new';
  iceGatheringState = 'complete';
  localDescription: RTCSessionDescription | null = null;
  channels: FakeDataChannel[] = [];
  closed = false;
  private readonly listeners = new Map<string, Set<() => void>>();

  constructor(_config: unknown) {
    void _config;
    FakePeerConnection.instances.push(this);
  }

  createDataChannel(label: string): FakeDataChannel {
    const dc = new FakeDataChannel(label);
    this.channels.push(dc);
    return dc;
  }

  addEventListener(type: string, cb: () => void): void {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(cb);
  }

  removeEventListener(type: string, cb: () => void): void {
    this.listeners.get(type)?.delete(cb);
  }

  async createOffer(): Promise<RTCSessionDescriptionInit> {
    return { type: 'offer', sdp: 'v=0\r\no=- fake-offer\r\n' };
  }

  async setLocalDescription(desc: RTCSessionDescriptionInit): Promise<void> {
    this.localDescription = desc as RTCSessionDescription;
  }

  async setRemoteDescription(): Promise<void> {
    /* no-op */
  }

  close(): void {
    this.closed = true;
    this.connectionState = 'closed';
  }
}

describe('openRtcDirect', () => {
  beforeEach(() => {
    FakePeerConnection.instances = [];
    authFetchWithStatusMock.mockReset();
    vi.stubGlobal('RTCPeerConnection', FakePeerConnection as unknown as typeof RTCPeerConnection);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('creates the runtime+http data channels, posts the offer over the tunnel-aware fetch, and resolves once both open AND the runtime channel rekeys to K1', async () => {
    // The mock plays the signaling server AND the host's rekey reply as a side
    // effect of answering the offer: open both raw channels (so each wrapper's
    // beginRekey fires) and reply to their hello2 with a sealed hn frame,
    // derived from the salts the client actually posted. Doing this inside the
    // mock (rather than racing ticks against openRtcDirect's own internal
    // await chain) lets the test just `await` the whole call once.
    authFetchWithStatusMock.mockImplementation(async (_path: string, opts: { body: { runtimeSalt: string; httpSalt: string } }) => {
      const pc = FakePeerConnection.instances[0];
      const runtimeDc = pc.channels.find((c) => c.label === 'runtime')!;
      const httpDc = pc.channels.find((c) => c.label === 'http')!;
      runtimeDc.simulateOpen();
      httpDc.simulateOpen();
      const root = await deriveRelayRoot('session-token');
      const runtimeK0 = await deriveAeadKey(root, base64UrlDecode(opts.body.runtimeSalt));
      const httpK0 = await deriveAeadKey(root, base64UrlDecode(opts.body.httpSalt));
      const hnReply = (k0: CryptoKey) => seal(k0, DIR_HOST_TO_CLIENT, 0, JSON.stringify({ c: 'hn', hn: base64UrlNoPad(crypto.getRandomValues(new Uint8Array(16))) }));
      runtimeDc.simulateMessage(toArrayBuffer(await hnReply(runtimeK0)));
      httpDc.simulateMessage(toArrayBuffer(await hnReply(httpK0)));
      return {
        response: new Response(JSON.stringify({ sdp: 'v=0\r\no=- fake-answer\r\n' }), { status: 200 }),
        status: 200,
      };
    });

    const conn = await openRtcDirect('session-token');

    expect(conn.runtime).toBeInstanceOf(RtcRuntimeChannel);
    expect(conn.runtime.readyState).toBe(RtcRuntimeChannel.OPEN);
    expect(conn.http).toBeInstanceOf(RtcHttpTunnel);
    expect(authFetchWithStatusMock).toHaveBeenCalledTimes(1);
    const [path, offerOpts] = authFetchWithStatusMock.mock.calls[0] as [string, { method: string; body: { sdp: string; runtimeSalt: string; httpSalt: string } }];
    expect(path).toBe('/rtc/offer');
    expect(offerOpts.method).toBe('POST');
    expect(offerOpts.body.sdp).toContain('fake-offer');
    expect(offerOpts.body.runtimeSalt).not.toBe(offerOpts.body.httpSalt);

    const pc = FakePeerConnection.instances[0];
    expect(pc.channels.map((c) => c.label).sort()).toEqual(['http', 'runtime']);
    expect(pc.channels.every((c) => c.binaryType === 'arraybuffer')).toBe(true);
  });

  it('resolves via the K0 legacy fallback when the host never answers either channel\'s hello2', async () => {
    vi.useFakeTimers();
    try {
      // Same signaling-side-effect trick, but the mock never replies to
      // hello2 on either channel - both must fall back to K0 after
      // REKEY_TIMEOUT_MS, and openRtcDirect still resolves once that settles.
      authFetchWithStatusMock.mockImplementation(async () => {
        for (const dc of FakePeerConnection.instances[0].channels) dc.simulateOpen();
        return {
          response: new Response(JSON.stringify({ sdp: 'v=0\r\no=- fake-answer\r\n' }), { status: 200 }),
          status: 200,
        };
      });

      const promise = openRtcDirect('session-token');
      for (let i = 0; i < 60; i++) await vi.advanceTimersByTimeAsync(100); // well past REKEY_TIMEOUT_MS

      const conn = await promise;
      expect(conn.runtime.readyState).toBe(RtcRuntimeChannel.OPEN);
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects when the runtime channel closes mid-rekey, before any reply or the fallback timeout', async () => {
    authFetchWithStatusMock.mockImplementation(async () => {
      for (const dc of FakePeerConnection.instances[0].channels) dc.simulateOpen();
      return {
        response: new Response(JSON.stringify({ sdp: 'v=0\r\no=- fake-answer\r\n' }), { status: 200 }),
        status: 200,
      };
    });

    const promise = openRtcDirect('session-token');
    // Let both channels open, hello2 go out on each, and openRtcDirect reach
    // its post-Promise.all rekey-wait (armed once both raw channels are open,
    // done above inside the mock) - nobody replies to hello2, and the
    // REKEY_TIMEOUT_MS fallback never fires within this test.
    await flushAsync();
    await flushAsync();

    const runtimeDc = FakePeerConnection.instances[0].channels.find((c) => c.label === 'runtime')!;
    runtimeDc.close();

    await expect(promise).rejects.toThrow();
  });

  it('rejects on a 403 answer and closes the peer connection', async () => {
    authFetchWithStatusMock.mockResolvedValue({ response: new Response('', { status: 403 }), status: 403 });

    await expect(openRtcDirect('session-token')).rejects.toThrow();
    expect(FakePeerConnection.instances[0].closed).toBe(true);
  });

  it('rejects when the offer request fails outright', async () => {
    authFetchWithStatusMock.mockResolvedValue({ response: null, status: 0 });

    await expect(openRtcDirect('session-token')).rejects.toThrow();
    expect(FakePeerConnection.instances[0].closed).toBe(true);
  });

  it('rejects immediately when the killswitch flag disables it, never creating a peer connection', async () => {
    localStorage.setItem('nexus.rtcDirect', '0');

    expect(isRtcDirectEligible()).toBe(false);
    await expect(openRtcDirect('session-token')).rejects.toThrow();
    expect(FakePeerConnection.instances).toHaveLength(0);
    expect(authFetchWithStatusMock).not.toHaveBeenCalled();
  });
});
