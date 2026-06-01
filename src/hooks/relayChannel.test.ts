import { afterEach, describe, expect, it, vi } from 'vitest';
import { pairOverRelay } from './relayChannel';
import {
  DIR_HOST_TO_CLIENT,
  deriveAeadKey,
  derivePairRoot,
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

// Walk the handshake up to the point where the client has sent its sealed claim
// and is awaiting the reply. Returns the connSalt so the reply can be sealed.
function driveToAwaitingReply(ws: FakeWebSocket): string {
  ws.emitOpen();
  const connSalt = connSaltFromHello(ws);
  ws.emitText(JSON.stringify({ e: 'peer-up' }));
  return connSalt;
}

describe('pairOverRelay — post-claim close race (WebKit)', () => {
  const realWebSocket = globalThis.WebSocket;

  afterEach(() => {
    globalThis.WebSocket = realWebSocket;
    FakeWebSocket.last = null;
    vi.restoreAllMocks();
  });

  it('resolves the claim from a received reply frame even if close arrives first', async () => {
    globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;

    const promise = pairOverRelay(RELAY_URL, PAIR_TOKEN, 'iPhone');
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

    const promise = pairOverRelay(RELAY_URL, PAIR_TOKEN, 'iPhone');
    const ws = await awaitSocket();

    driveToAwaitingReply(ws);
    await flush();

    // No reply frame — the relay peer-downs / closes. This is a genuine failure
    // (PC never answered) and MUST still reject.
    ws.emitText(JSON.stringify({ e: 'peer-down' }));
    ws.emitClose();

    await expect(promise).rejects.toThrow();
  });

  it('rejects a claim-err reply (host refused) — not treated as success', async () => {
    globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;

    const promise = pairOverRelay(RELAY_URL, PAIR_TOKEN, 'iPhone');
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

    const promise = pairOverRelay(RELAY_URL, PAIR_TOKEN, 'iPhone');
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

// Yield to the event loop a few turns so chained crypto.subtle-backed awaits
// (derive → seal → send, or open() → parse → resolve) all settle.
async function flush(): Promise<void> {
  for (let i = 0; i < 6; i++) await tick();
}

function tick(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}
