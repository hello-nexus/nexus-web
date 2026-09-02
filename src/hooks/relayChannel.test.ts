// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RelayChannel, pairOverRelay } from './relayChannel';
import {
  DIR_CLIENT_TO_HOST,
  DIR_HOST_TO_CLIENT,
  REKEY_HELLO2,
  REKEY_TIMEOUT_MS,
  base64UrlNoPad,
  deriveAeadKey,
  deriveRekeyedAeadKey,
  derivePairRoot,
  deriveRelayRoot,
  open as openFrame,
  seal,
} from '../api/relayCrypto';

// These tests pin the WebKit post-claim close-race fix: a BINARY reply frame is
// authoritative, so a close / peer-down arriving immediately AFTER it (the PC's
// normal single-use-token cleanup) must NOT turn a successful claim into a
// failure. They drive a fake WebSocket so we control the exact frame ordering
// (reply frame, then close, before the async AES-GCM open() resolves).

const PAIR_TOKEN = 'pair-token-for-relaychannel-test';
const RELAY_URL = 'wss://relay.example/relay';

// A minimal scriptable WebSocket stand-in. Only the surface RelayChannel /
// pairOverRelay touch is implemented: binaryType, send, close, and the four
// on* handlers. Tests push frames via emit*.
class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  static last: FakeWebSocket | null = null;

  binaryType = 'blob';
  readyState = FakeWebSocket.CONNECTING;
  onopen: ((e: Event) => void) | null = null;
  onmessage: ((e: MessageEvent) => void) | null = null;
  onclose: ((e: Event) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;

  sent: Array<string | ArrayBuffer> = [];

  constructor(public url: string) {
    FakeWebSocket.last = this;
  }

  send(data: string | ArrayBuffer): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = FakeWebSocket.CLOSED;
  }

  // ---- test drivers ----
  emitOpen(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.(new Event('open'));
  }

  emitText(data: string): void {
    this.onmessage?.(new MessageEvent('message', { data }));
  }

  emitBinary(data: ArrayBuffer): void {
    this.onmessage?.(new MessageEvent('message', { data }));
  }

  emitClose(): void {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.(new Event('close'));
  }
}

// Seal a host→client reply under the SAME key the client derives, using the
// connSalt the client put in its hello frame (so open() succeeds).
async function sealReply(connSaltB64: string, reply: object): Promise<ArrayBuffer> {
  const pairRoot = await derivePairRoot(PAIR_TOKEN);
  const connSalt = fromBase64Url(connSaltB64);
  const key = await deriveAeadKey(pairRoot, connSalt);
  const frame = await seal(key, DIR_HOST_TO_CLIENT, 0, JSON.stringify(reply));
  const out = new ArrayBuffer(frame.byteLength);
  new Uint8Array(out).set(frame);
  return out;
}

function fromBase64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function connSaltFromHello(ws: FakeWebSocket): string {
  const hello = ws.sent.find((d) => typeof d === 'string') as string;
  return (JSON.parse(hello) as { salt: string }).salt;
}

// pairOverRelay derives keys (async HKDF via crypto.subtle, which resolves off
// the macrotask queue) before constructing the WebSocket, so yield to the event
// loop until the fake socket has been created.
async function awaitSocket(): Promise<FakeWebSocket> {
  for (let i = 0; i < 50 && !FakeWebSocket.last; i++) await tick();
  if (!FakeWebSocket.last) throw new Error('socket was never constructed');
  return FakeWebSocket.last;
}

// Same as awaitSocket, but under vi.useFakeTimers() - advances the fake clock
// (which also flushes pending microtasks, including crypto.subtle) instead of
// yielding via a real setTimeout.
async function awaitSocketFake(): Promise<FakeWebSocket> {
  for (let i = 0; i < 50 && !FakeWebSocket.last; i++) await vi.advanceTimersByTimeAsync(0);
  if (!FakeWebSocket.last) throw new Error('socket was never constructed');
  return FakeWebSocket.last;
}

// Same as flush(), but under vi.useFakeTimers().
async function flushFake(): Promise<void> {
  for (let i = 0; i < 6; i++) await vi.advanceTimersByTimeAsync(0);
}

// Pumps fake timers until `ready()` holds. A fixed pump count races the real
// crypto.subtle work on the rekey path: a slower machine has not resolved the
// key derivation by the time the assertions run, which is why these passed on
// a dev box and failed only on CI. Bounded, so a genuine regression still
// fails instead of hanging.
async function pumpUntil(ready: () => boolean, stepMs = 0, maxRounds = 300): Promise<void> {
  for (let i = 0; i < maxRounds && !ready(); i++) {
    await vi.advanceTimersByTimeAsync(stepMs);
  }
}

// Walk the handshake up to the point where the client has sent its sealed claim
// and is awaiting the reply. Returns the connSalt so the reply can be sealed.
function driveToAwaitingReply(ws: FakeWebSocket): string {
  ws.emitOpen();
  const connSalt = connSaltFromHello(ws);
  ws.emitText(JSON.stringify({ e: 'peer-up' }));
  return connSalt;
}

describe('pairOverRelay - post-claim close race (WebKit)', () => {
  const realWebSocket = globalThis.WebSocket;

  afterEach(() => {
    globalThis.WebSocket = realWebSocket;
    FakeWebSocket.last = null;
    vi.restoreAllMocks();
  });

  it('resolves the claim from a received reply frame even if close arrives first', async () => {
    globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;

    const promise = pairOverRelay(RELAY_URL, PAIR_TOKEN, 'iPhone', 'device-uuid-1');
    const ws = await awaitSocket();
    expect(ws).toBeTruthy();

    const connSalt = driveToAwaitingReply(ws);
    // Wait for the async seal() of the claim to flush so the client is in the
    // awaiting-reply state.
    await flush();

    const replyFrame = await sealReply(connSalt, {
      type: 'claim-ok',
      sessionToken: 'sess-123',
      machineName: 'TEST-PC',
    });

    // THE RACE: deliver the reply frame, then IMMEDIATELY a peer-down + close,
    // all before the async open() of the reply resolves. The fix must ignore
    // the close and still resolve from the reply frame.
    ws.emitBinary(replyFrame);
    ws.emitText(JSON.stringify({ e: 'peer-down' }));
    ws.emitClose();

    const result = await promise;
    expect(result).toEqual({ ok: true, sessionToken: 'sess-123', machineName: 'TEST-PC', spki: undefined });
  });

  it('rejects when the channel closes BEFORE any reply frame is received', async () => {
    globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;

    const promise = pairOverRelay(RELAY_URL, PAIR_TOKEN, 'iPhone', 'device-uuid-1');
    const ws = await awaitSocket();

    driveToAwaitingReply(ws);
    await flush();

    // No reply frame - the relay peer-downs / closes. This is a real failure
    // (PC never answered) and MUST still reject.
    ws.emitText(JSON.stringify({ e: 'peer-down' }));
    ws.emitClose();

    await expect(promise).rejects.toThrow();
  });

  it('rejects a claim-err reply (host refused) - not treated as success', async () => {
    globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;

    const promise = pairOverRelay(RELAY_URL, PAIR_TOKEN, 'iPhone', 'device-uuid-1');
    const ws = await awaitSocket();

    const connSalt = driveToAwaitingReply(ws);
    await flush();

    const replyFrame = await sealReply(connSalt, { type: 'claim-err', error: 'token expired' });
    ws.emitBinary(replyFrame);
    ws.emitClose();

    const result = await promise;
    expect(result).toEqual({ ok: false, error: 'token expired' });
  });

  it('rejects a tampered reply frame even after responseReceived is set', async () => {
    globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;

    const promise = pairOverRelay(RELAY_URL, PAIR_TOKEN, 'iPhone', 'device-uuid-1');
    const ws = await awaitSocket();

    const connSalt = driveToAwaitingReply(ws);
    await flush();

    // Seal a valid reply, then flip a ciphertext byte so the GCM tag fails.
    const good = new Uint8Array(await sealReply(connSalt, { type: 'claim-ok', sessionToken: 'x' }));
    good[good.length - 1] ^= 0xff;
    const tampered = new ArrayBuffer(good.byteLength);
    new Uint8Array(tampered).set(good);

    ws.emitBinary(tampered);
    ws.emitClose();

    await expect(promise).rejects.toThrow();
  });
});

describe('RelayChannel - no-host fast fail', () => {
  const realWebSocket = globalThis.WebSocket;

  afterEach(() => {
    globalThis.WebSocket = realWebSocket;
    FakeWebSocket.last = null;
    vi.restoreAllMocks();
  });

  it('opts in with nh:1 and closes fast on a no-host advisory (never reaches OPEN)', async () => {
    globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;

    const channel = new RelayChannel(RELAY_URL, 'session-token-for-runtime-test');
    let closed = false;
    channel.onclose = () => { closed = true; };
    let opened = false;
    channel.onopen = () => { opened = true; };

    void channel.connect();
    const ws = await awaitSocket();
    ws.emitOpen();
    await flush();

    // The runtime hello carries the nh:1 opt-in.
    const hello = JSON.parse(ws.sent.find((d) => typeof d === 'string') as string);
    expect(hello.role).toBe('client');
    expect(hello.nh).toBe(1);

    // Relay says no host is present → channel closes at once, never opens.
    ws.emitText(JSON.stringify({ e: 'no-host' }));
    await flush();

    expect(channel.readyState).toBe(RelayChannel.CLOSED);
    expect(closed).toBe(true);
    expect(opened).toBe(false);
  });
});

// v2 in-band rekey: the first BINARY frame after peer-up is {"c":"hello2"}
// under K0, and onopen is withheld until the host's reply resolves it (either
// a rekey to K1, or a legacy K0 fallback). See relayCrypto.ts's header comment
// for the full handshake and REKEY_KAT in relayCrypto.test.ts for the K1
// derivation vector.
describe('RelayChannel - v2 in-band rekey', () => {
  const realWebSocket = globalThis.WebSocket;
  const TOKEN = 'session-token-for-rekey-test';

  afterEach(() => {
    globalThis.WebSocket = realWebSocket;
    FakeWebSocket.last = null;
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  async function deriveK0(connSaltB64: string): Promise<CryptoKey> {
    const relayRoot = await deriveRelayRoot(TOKEN);
    return deriveAeadKey(relayRoot, fromBase64Url(connSaltB64));
  }

  async function deriveK1(connSaltB64: string, hostNonce: Uint8Array): Promise<CryptoKey> {
    const relayRoot = await deriveRelayRoot(TOKEN);
    return deriveRekeyedAeadKey(relayRoot, fromBase64Url(connSaltB64), hostNonce);
  }

  async function sealUnderKey(key: CryptoKey, dir: number, counter: number, plaintext: string): Promise<ArrayBuffer> {
    const frame = await seal(key, dir, counter, plaintext);
    const out = new ArrayBuffer(frame.byteLength);
    new Uint8Array(out).set(frame);
    return out;
  }

  function binaryFramesSent(ws: FakeWebSocket): ArrayBuffer[] {
    return ws.sent.filter((d): d is ArrayBuffer => d instanceof ArrayBuffer);
  }

  it('seals {"c":"hello2"} under K0 as the first BINARY frame after peer-up', async () => {
    globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
    const channel = new RelayChannel(RELAY_URL, TOKEN);

    void channel.connect();
    const ws = await awaitSocket();
    ws.emitOpen();
    const connSalt = connSaltFromHello(ws);
    ws.emitText(JSON.stringify({ e: 'peer-up' }));
    await flush();

    const frames = binaryFramesSent(ws);
    expect(frames).toHaveLength(1);
    const k0 = await deriveK0(connSalt);
    const opened = await openFrame(k0, new Uint8Array(frames[0]));
    expect(opened.dir).toBe(DIR_CLIENT_TO_HOST);
    expect(opened.counter).toBe(0);
    expect(opened.plaintext).toBe(REKEY_HELLO2);
  });

  it('rekeys to K1 on a valid hn reply: the next send is K1 counter 0, a K1 reply is accepted, and a K0 reply is rejected', async () => {
    globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
    const channel = new RelayChannel(RELAY_URL, TOKEN);
    let opened = false;
    channel.onopen = () => { opened = true; };
    const received: string[] = [];
    channel.onmessage = (e) => received.push(e.data as string);
    let closed = false;
    channel.onclose = () => { closed = true; };

    void channel.connect();
    const ws = await awaitSocket();
    ws.emitOpen();
    const connSalt = connSaltFromHello(ws);
    ws.emitText(JSON.stringify({ e: 'peer-up' }));
    await flush();

    const k0 = await deriveK0(connSalt);
    const hostNonce = crypto.getRandomValues(new Uint8Array(16));
    const hnFrame = await sealUnderKey(k0, DIR_HOST_TO_CLIENT, 0, JSON.stringify({ c: 'hn', hn: base64UrlNoPad(hostNonce) }));
    ws.emitBinary(hnFrame);
    await flush();

    expect(opened).toBe(true);
    expect(channel.readyState).toBe(RelayChannel.OPEN);

    channel.send('{"sub":["monitoring"]}');
    await flush();

    const k1 = await deriveK1(connSalt, hostNonce);
    const frames = binaryFramesSent(ws);
    expect(frames).toHaveLength(2); // [0] hello2 under K0, [1] the app's first send under K1
    const sent = await openFrame(k1, new Uint8Array(frames[1]));
    expect(sent.dir).toBe(DIR_CLIENT_TO_HOST);
    expect(sent.counter).toBe(0);
    expect(sent.plaintext).toBe('{"sub":["monitoring"]}');

    // A host frame sealed under K1 counter 0 is accepted.
    const k1Frame = await sealUnderKey(k1, DIR_HOST_TO_CLIENT, 0, '{"t":"monitoring","d":{}}');
    ws.emitBinary(k1Frame);
    await flush();
    expect(received).toEqual(['{"t":"monitoring","d":{}}']);

    // A frame sealed under the superseded K0 fails tag-verify under K1 and
    // closes the channel, exactly like any other tampered frame.
    const k0Frame = await sealUnderKey(k0, DIR_HOST_TO_CLIENT, 1, '{"t":"stale","d":{}}');
    ws.emitBinary(k0Frame);
    await flush();
    expect(closed).toBe(true);
    expect(received).toEqual(['{"t":"monitoring","d":{}}']);
  });

  it('falls back to K0 when the first host frame is not hn, delivering it normally', async () => {
    globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
    const channel = new RelayChannel(RELAY_URL, TOKEN);
    let opened = false;
    channel.onopen = () => { opened = true; };
    const received: string[] = [];
    channel.onmessage = (e) => received.push(e.data as string);

    void channel.connect();
    const ws = await awaitSocket();
    ws.emitOpen();
    const connSalt = connSaltFromHello(ws);
    ws.emitText(JSON.stringify({ e: 'peer-up' }));
    await flush();

    const k0 = await deriveK0(connSalt);
    // A legacy (v1) host answers hello2 with real multiplex data, not hn.
    const dataFrame = await sealUnderKey(k0, DIR_HOST_TO_CLIENT, 0, '{"t":"monitoring","d":{"cpu":1}}');
    ws.emitBinary(dataFrame);
    await flush();

    expect(opened).toBe(true);
    expect(channel.readyState).toBe(RelayChannel.OPEN);
    expect(received).toEqual(['{"t":"monitoring","d":{"cpu":1}}']);

    // The next app send stays on K0, counter continuing from 1 - counter 0
    // under K0 was already spent by hello2 and must never be reused.
    channel.send('{"sub":["monitoring"]}');
    await flush();
    const frames = binaryFramesSent(ws);
    expect(frames).toHaveLength(2);
    const sent = await openFrame(k0, new Uint8Array(frames[1]));
    expect(sent.counter).toBe(1);
    expect(sent.plaintext).toBe('{"sub":["monitoring"]}');
  });

  it('falls back to K0 after REKEY_TIMEOUT_MS with no host reply at all', async () => {
    vi.useFakeTimers();
    globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
    const channel = new RelayChannel(RELAY_URL, TOKEN);
    let opened = false;
    channel.onopen = () => { opened = true; };

    void channel.connect();
    const ws = await awaitSocketFake();
    ws.emitOpen();
    const connSalt = connSaltFromHello(ws);
    ws.emitText(JSON.stringify({ e: 'peer-up' }));
    await flushFake();

    expect(opened).toBe(false); // still waiting on the hn reply / timeout

    await vi.advanceTimersByTimeAsync(REKEY_TIMEOUT_MS);
    await pumpUntil(() => opened);
    expect(opened).toBe(true);
    expect(channel.readyState).toBe(RelayChannel.OPEN);

    const k0 = await deriveK0(connSalt);
    channel.send('{"sub":["monitoring"]}');
    await pumpUntil(() => binaryFramesSent(ws).length >= 2);
    const frames = binaryFramesSent(ws);
    expect(frames).toHaveLength(2);
    const sent = await openFrame(k0, new Uint8Array(frames[1]));
    expect(sent.counter).toBe(1); // 0 was hello2, never reused
  });

  it('closes the channel on a tampered first host frame instead of falling back', async () => {
    globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
    const channel = new RelayChannel(RELAY_URL, TOKEN);
    let opened = false;
    channel.onopen = () => { opened = true; };
    let closed = false;
    channel.onclose = () => { closed = true; };

    void channel.connect();
    const ws = await awaitSocket();
    ws.emitOpen();
    const connSalt = connSaltFromHello(ws);
    ws.emitText(JSON.stringify({ e: 'peer-up' }));
    await flush();

    const k0 = await deriveK0(connSalt);
    const good = new Uint8Array(await sealUnderKey(k0, DIR_HOST_TO_CLIENT, 0, JSON.stringify({ c: 'hn', hn: 'x' })));
    good[good.length - 1] ^= 0xff;
    const tampered = new ArrayBuffer(good.byteLength);
    new Uint8Array(tampered).set(good);
    ws.emitBinary(tampered);
    await flush();

    expect(opened).toBe(false);
    expect(closed).toBe(true);
  });

  it('closes the channel when the hn field is not valid base64url', async () => {
    globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
    const channel = new RelayChannel(RELAY_URL, TOKEN);
    let opened = false;
    channel.onopen = () => { opened = true; };
    let closed = false;
    channel.onclose = () => { closed = true; };

    void channel.connect();
    const ws = await awaitSocket();
    ws.emitOpen();
    const connSalt = connSaltFromHello(ws);
    ws.emitText(JSON.stringify({ e: 'peer-up' }));
    await flush();

    const k0 = await deriveK0(connSalt);
    // A validly-sealed frame (tag verifies) whose hn value is not base64url.
    const badHn = await sealUnderKey(k0, DIR_HOST_TO_CLIENT, 0, JSON.stringify({ c: 'hn', hn: '!!!not base64!!!' }));
    ws.emitBinary(badHn);
    await flush();

    expect(opened).toBe(false);
    expect(closed).toBe(true);
  });

  it('closes the channel when an hn frame arrives after the handshake already settled (key desync)', async () => {
    globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
    const channel = new RelayChannel(RELAY_URL, TOKEN);
    let opened = false;
    channel.onopen = () => { opened = true; };
    const received: string[] = [];
    channel.onmessage = (e) => received.push(e.data as string);
    let closed = false;
    channel.onclose = () => { closed = true; };

    void channel.connect();
    const ws = await awaitSocket();
    ws.emitOpen();
    const connSalt = connSaltFromHello(ws);
    ws.emitText(JSON.stringify({ e: 'peer-up' }));
    await flush();

    // Legacy fallback settles the handshake on K0.
    const k0 = await deriveK0(connSalt);
    const dataFrame = await sealUnderKey(k0, DIR_HOST_TO_CLIENT, 0, '{"t":"monitoring","d":{"cpu":1}}');
    ws.emitBinary(dataFrame);
    await flush();
    expect(opened).toBe(true);
    expect(channel.readyState).toBe(RelayChannel.OPEN);

    // An hn frame now (the host apparently switched to K1 after our fallback
    // timer already committed us to K0) is an unrecoverable key desync.
    const lateHn = await sealUnderKey(k0, DIR_HOST_TO_CLIENT, 1, JSON.stringify({ c: 'hn', hn: 'yQ' }));
    ws.emitBinary(lateHn);
    await flush();

    expect(received).toEqual(['{"t":"monitoring","d":{"cpu":1}}']);
    expect(closed).toBe(true);
  });
});

// Yield to the event loop a few turns so chained crypto.subtle-backed awaits
// (derive → seal → send, or open() → parse → resolve) all settle.
async function flush(): Promise<void> {
  for (let i = 0; i < 6; i++) await tick();
}

function tick(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}
