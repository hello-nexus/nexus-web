import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deriveAeadKey, deriveRelayRoot, open as openFrame, seal, DIR_CLIENT_TO_HOST, DIR_HOST_TO_CLIENT } from './relayCrypto';

// Exercises the two RTCDataChannel wrappers (RtcRuntimeChannel, RtcHttpTunnel)
// directly against a scriptable fake channel - no real WebRTC involved - plus
// the openRtcDirect handshake against a fake RTCPeerConnection. The sealed
// framing must interop byte-for-byte with the relay path, so the KAT vector is
// the SAME one relayCrypto.test.ts locks (dir=1 counter=0 host->client).

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

async function deriveTestKey(): Promise<CryptoKey> {
  const root = await deriveRelayRoot(KAT.token);
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

describe('RtcRuntimeChannel sealed framing', () => {
  it('opens the relayCrypto KAT frame (interop with the relay path)', async () => {
    const key = await deriveTestKey();
    const dc = new FakeDataChannel('runtime');
    dc.readyState = 'open';
    const onFatal = vi.fn();
    const channel = new RtcRuntimeChannel(dc as unknown as RTCDataChannel, key, onFatal);
    const received: string[] = [];
    channel.onmessage = (e) => received.push(e.data as string);

    dc.simulateMessage(toArrayBuffer(fromHex(KAT.frame)));
    await flushAsync();

    expect(received).toEqual([KAT.plaintext]);
    expect(onFatal).not.toHaveBeenCalled();
  });

  it('seals outbound sends as dir=client->host with an incrementing counter', async () => {
    const key = await deriveTestKey();
    const dc = new FakeDataChannel('runtime');
    dc.readyState = 'open';
    const channel = new RtcRuntimeChannel(dc as unknown as RTCDataChannel, key, vi.fn());

    channel.send('{"sub":["monitoring"]}');
    channel.send('{"sub":["lighting"]}');
    await flushAsync();
    await flushAsync();

    expect(dc.sent).toHaveLength(2);
    const first = await openFrame(key, new Uint8Array(dc.sent[0]));
    const second = await openFrame(key, new Uint8Array(dc.sent[1]));
    expect(first.dir).toBe(DIR_CLIENT_TO_HOST);
    expect(first.counter).toBe(0);
    expect(first.plaintext).toBe('{"sub":["monitoring"]}');
    expect(second.counter).toBe(1);
    expect(second.plaintext).toBe('{"sub":["lighting"]}');
  });

  it('processes inbound frames in delivery order even when their decrypts would settle out of order', async () => {
    // dc.onmessage fires once per delivered frame, but AEAD decrypt is async;
    // without serializing handleMessage, a slow-to-decrypt earlier frame could
    // have its monotonic-counter check run AFTER a faster later frame already
    // advanced lastRecvCounter, misfiring onFatal on legitimate traffic. Gate
    // the FIRST decrypt call to prove the second frame's decrypt is never even
    // attempted until the first frame's handling has fully completed.
    const key = await deriveTestKey();
    const dc = new FakeDataChannel('runtime');
    dc.readyState = 'open';
    const onFatal = vi.fn();
    const channel = new RtcRuntimeChannel(dc as unknown as RTCDataChannel, key, onFatal);
    const received: string[] = [];
    channel.onmessage = (e) => received.push(e.data as string);

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
    const channel = new RtcRuntimeChannel(dc as unknown as RTCDataChannel, key, onFatal);
    const received: string[] = [];
    channel.onmessage = (e) => received.push(e.data as string);

    const frame0 = await seal(key, DIR_HOST_TO_CLIENT, 0, '{"t":"a","d":1}');
    dc.simulateMessage(toArrayBuffer(frame0));
    await flushAsync();
    // Replay the same counter - must be rejected, not delivered.
    dc.simulateMessage(toArrayBuffer(frame0));
    await flushAsync();

    expect(received).toEqual(['{"t":"a","d":1}']);
    expect(onFatal).toHaveBeenCalledTimes(1);
  });

  it('rejects a frame in the wrong direction (client->host reflected back)', async () => {
    const key = await deriveTestKey();
    const dc = new FakeDataChannel('runtime');
    dc.readyState = 'open';
    const onFatal = vi.fn();
    const channel = new RtcRuntimeChannel(dc as unknown as RTCDataChannel, key, onFatal);
    const received: string[] = [];
    channel.onmessage = (e) => received.push(e.data as string);

    const wrongDir = await seal(key, DIR_CLIENT_TO_HOST, 0, '{"t":"a","d":1}');
    dc.simulateMessage(toArrayBuffer(wrongDir));
    await flushAsync();

    expect(received).toEqual([]);
    expect(onFatal).toHaveBeenCalledTimes(1);
  });

  it('rejects a tampered frame (GCM tag verify fails) and closes the connection', async () => {
    const key = await deriveTestKey();
    const dc = new FakeDataChannel('runtime');
    dc.readyState = 'open';
    const onFatal = vi.fn();
    const channel = new RtcRuntimeChannel(dc as unknown as RTCDataChannel, key, onFatal);
    const received: string[] = [];
    channel.onmessage = (e) => received.push(e.data as string);

    const frame = await seal(key, DIR_HOST_TO_CLIENT, 0, '{"t":"a","d":1}');
    frame[frame.byteLength - 1] ^= 0xff; // flip a tag byte
    dc.simulateMessage(toArrayBuffer(frame));
    await flushAsync();

    expect(received).toEqual([]);
    expect(onFatal).toHaveBeenCalledTimes(1);
  });

  it('onopen fires (async) when assigned after the channel is already open', async () => {
    const key = await deriveTestKey();
    const dc = new FakeDataChannel('runtime');
    dc.readyState = 'open'; // already open before the wrapper is constructed
    const channel = new RtcRuntimeChannel(dc as unknown as RTCDataChannel, key, vi.fn());

    const opened = vi.fn();
    channel.onopen = opened;
    expect(opened).not.toHaveBeenCalled(); // not synchronous
    await flushAsync();
    await flushAsync();
    expect(opened).toHaveBeenCalledTimes(1);
  });

  it('onopen fires when the channel opens after construction', async () => {
    const key = await deriveTestKey();
    const dc = new FakeDataChannel('runtime');
    const channel = new RtcRuntimeChannel(dc as unknown as RTCDataChannel, key, vi.fn());
    const opened = vi.fn();
    channel.onopen = opened;
    expect(opened).not.toHaveBeenCalled();

    dc.simulateOpen();
    expect(opened).toHaveBeenCalledTimes(1);
    expect(channel.readyState).toBe(RtcRuntimeChannel.OPEN);
  });

  it('close() is idempotent and fires onclose once', async () => {
    const key = await deriveTestKey();
    const dc = new FakeDataChannel('runtime');
    dc.readyState = 'open';
    const channel = new RtcRuntimeChannel(dc as unknown as RTCDataChannel, key, vi.fn());
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
    const channel = new RtcRuntimeChannel(dc as unknown as RTCDataChannel, key, onFatal);
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
  it('seals a request and resolves the matched sealed response', async () => {
    const key = await deriveTestKey();
    const dc = new FakeDataChannel('http');
    dc.readyState = 'open';
    const tunnel = new RtcHttpTunnel(dc as unknown as RTCDataChannel, key, vi.fn());

    const pending = tunnel.request('GET', '/panel/devices', null, null);
    await flushAsync();
    expect(dc.sent).toHaveLength(1);
    const req = await openFrame(key, new Uint8Array(dc.sent[0]));
    expect(req.dir).toBe(DIR_CLIENT_TO_HOST);
    const parsedReq = JSON.parse(req.plaintext) as { id: number; method: string; path: string };
    expect(parsedReq.method).toBe('GET');
    expect(parsedReq.path).toBe('/panel/devices');

    const replyFrame = await seal(key, DIR_HOST_TO_CLIENT, 0, JSON.stringify({
      id: parsedReq.id, status: 200, body: '{"ok":true}', contentType: 'application/json', base64: false,
    }));
    dc.simulateMessage(toArrayBuffer(replyFrame));

    const res = await pending;
    expect(res.status).toBe(200);
    expect(res.body).toBe('{"ok":true}');
  });

  it('multiplexes concurrent requests, matching replies out of order by id', async () => {
    const key = await deriveTestKey();
    const dc = new FakeDataChannel('http');
    dc.readyState = 'open';
    const tunnel = new RtcHttpTunnel(dc as unknown as RTCDataChannel, key, vi.fn());

    const first = tunnel.request('GET', '/panel/a', null, null);
    const second = tunnel.request('GET', '/panel/b', null, null);
    await flushAsync();
    await flushAsync();
    expect(dc.sent).toHaveLength(2);

    const reqA = await openFrame(key, new Uint8Array(dc.sent[0]));
    const reqB = await openFrame(key, new Uint8Array(dc.sent[1]));
    const idA = (JSON.parse(reqA.plaintext) as { id: number }).id;
    const idB = (JSON.parse(reqB.plaintext) as { id: number }).id;

    // Reply to B first, then A - a correct impl matches strictly by id.
    const replyB = await seal(key, DIR_HOST_TO_CLIENT, 0, JSON.stringify({ id: idB, status: 200, body: '"b"', contentType: null, base64: false }));
    dc.simulateMessage(toArrayBuffer(replyB));
    const replyA = await seal(key, DIR_HOST_TO_CLIENT, 1, JSON.stringify({ id: idA, status: 200, body: '"a"', contentType: null, base64: false }));
    dc.simulateMessage(toArrayBuffer(replyA));

    expect(await first).toMatchObject({ body: '"a"' });
    expect(await second).toMatchObject({ body: '"b"' });
  });

  it('rejects a new request as busy when bufferedAmount is over the backpressure threshold', async () => {
    const key = await deriveTestKey();
    const dc = new FakeDataChannel('http');
    dc.readyState = 'open';
    dc.bufferedAmount = 8 * 1024 * 1024; // over the 4MB guard
    const tunnel = new RtcHttpTunnel(dc as unknown as RTCDataChannel, key, vi.fn());

    await expect(tunnel.request('GET', '/panel/devices', null, null)).rejects.toThrow(/busy/);
    expect(dc.sent).toHaveLength(0);
  });

  it('rejects an oversized request without ever sending it', async () => {
    const key = await deriveTestKey();
    const dc = new FakeDataChannel('http');
    dc.readyState = 'open';
    const tunnel = new RtcHttpTunnel(dc as unknown as RTCDataChannel, key, vi.fn());

    const hugeBody = 'x'.repeat(300 * 1024); // exceeds the 256KB frame cap once sealed
    await expect(tunnel.request('POST', '/panel/media', hugeBody, 'application/octet-stream')).rejects.toThrow(/large/);
    expect(dc.sent).toHaveLength(0);
  });

  it('rejects immediately when the channel is not open', async () => {
    const key = await deriveTestKey();
    const dc = new FakeDataChannel('http'); // readyState stays 'connecting'
    const tunnel = new RtcHttpTunnel(dc as unknown as RTCDataChannel, key, vi.fn());

    await expect(tunnel.request('GET', '/panel/devices', null, null)).rejects.toThrow();
    expect(dc.sent).toHaveLength(0);
  });

  it('close() rejects in-flight requests', async () => {
    const key = await deriveTestKey();
    const dc = new FakeDataChannel('http');
    dc.readyState = 'open';
    const tunnel = new RtcHttpTunnel(dc as unknown as RTCDataChannel, key, vi.fn());

    const pending = tunnel.request('GET', '/panel/devices', null, null);
    await flushAsync();
    tunnel.close();

    await expect(pending).rejects.toThrow();
  });

  it('rejects a tampered response frame (tag verify fails), never resolving the request', async () => {
    const key = await deriveTestKey();
    const dc = new FakeDataChannel('http');
    dc.readyState = 'open';
    const onFatal = vi.fn();
    const tunnel = new RtcHttpTunnel(dc as unknown as RTCDataChannel, key, onFatal);

    tunnel.request('GET', '/panel/devices', null, null).catch(() => {});
    await flushAsync();
    const req = await openFrame(key, new Uint8Array(dc.sent[0]));
    const id = (JSON.parse(req.plaintext) as { id: number }).id;
    const frame = await seal(key, DIR_HOST_TO_CLIENT, 0, JSON.stringify({ id, status: 200, body: '{}', contentType: null, base64: false }));
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

async function flush(ticks = 12): Promise<void> {
  for (let i = 0; i < ticks; i++) await Promise.resolve();
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

  it('creates the runtime+http data channels, posts the offer over the tunnel-aware fetch, and resolves once both open', async () => {
    authFetchWithStatusMock.mockResolvedValue({
      response: new Response(JSON.stringify({ sdp: 'v=0\r\no=- fake-answer\r\n' }), { status: 200 }),
      status: 200,
    });

    const promise = openRtcDirect('session-token');
    await flush();
    const pc = FakePeerConnection.instances[0];
    expect(pc.channels.map((c) => c.label).sort()).toEqual(['http', 'runtime']);
    expect(pc.channels.every((c) => c.binaryType === 'arraybuffer')).toBe(true);

    for (const dc of pc.channels) dc.simulateOpen();
    const conn = await promise;

    expect(conn.runtime).toBeInstanceOf(RtcRuntimeChannel);
    expect(conn.http).toBeInstanceOf(RtcHttpTunnel);
    expect(authFetchWithStatusMock).toHaveBeenCalledTimes(1);
    const [path, opts] = authFetchWithStatusMock.mock.calls[0] as [string, { method: string; body: { sdp: string; runtimeSalt: string; httpSalt: string } }];
    expect(path).toBe('/rtc/offer');
    expect(opts.method).toBe('POST');
    expect(opts.body.sdp).toContain('fake-offer');
    expect(opts.body.runtimeSalt).not.toBe(opts.body.httpSalt);
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
