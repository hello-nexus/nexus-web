// WebRTC DataChannel direct P2P transport (the "direct" upgrade). Once the
// phone is connected to the host over the cloud relay, it attempts a
// background hole-punch straight to the host PC (STUN only) and, on success,
// hands both the runtime multiplex stream and the REST tunnel to two
// SCTP data channels - the relay stays open as instant fallback until the
// swap succeeds (useMultiplexSocket.ts owns that hot-swap).
//
// Signaling: POST /rtc/offer over the existing authed fetch path (so it rides
// the sealed REST-over-relay tunnel when remote). The phone is always the
// offerer and creates both data channels - "runtime" and "http" - before
// createOffer, non-trickle (waits for ICE gathering, capped, then posts the
// full offer SDP once). Framing on both channels is byte-identical to the
// relay path (relayCrypto seal/open): frame = nonce(12)||ciphertext||tag(16),
// dir=2 client→host, dir=1 host→client, per-channel counters starting at 0
// under a per-channel key derived from a fresh random salt handed to the host
// in the offer request. 256KB max frame either direction.

import {
  DIR_CLIENT_TO_HOST,
  DIR_HOST_TO_CLIENT,
  base64UrlNoPad,
  deriveAeadKey,
  deriveRelayRoot,
  open as openFrame,
  seal,
} from './relayCrypto';
import {
  PendingRequestTracker,
  buildRequestWire,
  type HttpTunnelResponseWire,
  type RelayHttpMethod,
  type RelayResponse,
} from './httpTunnelFraming';
import { authFetchWithStatus } from './service';

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.cloudflare.com:3478' },
  { urls: 'stun:stun.l.google.com:19302' },
];

// Non-trickle: the offer is posted once, so gathering must finish (or hit this
// cap) before it's sent. Matches the host's own gathering cap.
const ICE_GATHER_TIMEOUT_MS = 4000;
// Both data channels must reach 'open' after the answer is applied, or the
// punch is treated as failed.
const CHANNEL_OPEN_TIMEOUT_MS = 12000;
// Same request timeout as the relay HTTP tunnel - the host dispatches through
// its real route pipeline before answering.
const REQUEST_TIMEOUT_MS = 20000;
// Wire contract cap, both directions, both channels.
const MAX_FRAME_BYTES = 256 * 1024;
// Backpressure guard on the http data channel: reject a new request rather
// than queue unbounded bytes onto a slow/stalled channel.
const MAX_BUFFERED_AMOUNT = 4 * 1024 * 1024;

const RTC_DIRECT_FLAG_KEY = 'nexus.rtcDirect';

/** False only when explicitly disabled (localStorage flag) or the browser has no WebRTC support. */
export function isRtcDirectEligible(): boolean {
  if (typeof RTCPeerConnection === 'undefined') return false;
  try {
    return typeof localStorage === 'undefined' || localStorage.getItem(RTC_DIRECT_FLAG_KEY) !== '0';
  } catch {
    return true;
  }
}

function randomSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(16));
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const out = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(out).set(bytes);
  return out;
}

function waitForIceGatheringComplete(pc: RTCPeerConnection, timeoutMs: number): Promise<void> {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(() => { cleanup(); resolve(); }, timeoutMs);
    const onChange = () => {
      if (pc.iceGatheringState === 'complete') { cleanup(); resolve(); }
    };
    const cleanup = () => {
      clearTimeout(timer);
      pc.removeEventListener('icegatheringstatechange', onChange);
    };
    pc.addEventListener('icegatheringstatechange', onChange);
  });
}

function waitForChannelOpen(dc: RTCDataChannel, timeoutMs: number): Promise<void> {
  if (dc.readyState === 'open') return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { cleanup(); reject(new Error('rtc direct: channel open timeout')); }, timeoutMs);
    const onOpen = () => { cleanup(); resolve(); };
    const onClose = () => { cleanup(); reject(new Error('rtc direct: channel closed before open')); };
    const cleanup = () => {
      clearTimeout(timer);
      dc.removeEventListener('open', onOpen);
      dc.removeEventListener('close', onClose);
    };
    dc.addEventListener('open', onOpen);
    dc.addEventListener('close', onClose);
  });
}

/**
 * The "runtime" data channel wrapped in the same WebSocket-shaped seam
 * RelayChannel exposes, so useMultiplexSocket's wireTransport drives it
 * unchanged. The channel is already open by the time this is constructed by
 * openRtcDirect's caller in the common case; `onopen` fires (async) the moment
 * a handler is assigned if the channel got there first.
 */
export class RtcRuntimeChannel {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  readyState: number;
  onmessage: ((e: MessageEvent) => void) | null = null;
  onclose: ((e: CloseEvent) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;

  private _onopen: ((e: Event) => void) | null = null;
  get onopen(): ((e: Event) => void) | null { return this._onopen; }
  set onopen(handler: ((e: Event) => void) | null) {
    this._onopen = handler;
    if (handler && this.readyState === RtcRuntimeChannel.OPEN) {
      queueMicrotask(() => this._onopen === handler && handler(new Event('open')));
    }
  }

  private sendCounter = 0;
  // Serializes outbound writes so frames reach the wire in counter order.
  private sendTail: Promise<void> = Promise.resolve();
  private lastRecvCounter = -1;
  private readonly dc: RTCDataChannel;
  private readonly aeadKey: CryptoKey;
  private readonly onFatal: () => void;
  // Chains each handleMessage call onto the previous one's completion so the
  // (async) AEAD decrypts settle in delivery order - SCTP delivers this
  // channel's frames in order, but nothing otherwise guarantees two
  // concurrently-kicked-off decrypts RESOLVE in that same order, which would
  // make the monotonic-counter check misfire on legitimate back-to-back frames.
  private inbox: Promise<void> = Promise.resolve();

  constructor(dc: RTCDataChannel, aeadKey: CryptoKey, onFatal: () => void) {
    this.dc = dc;
    this.aeadKey = aeadKey;
    this.onFatal = onFatal;
    this.readyState = dc.readyState === 'open' ? RtcRuntimeChannel.OPEN : RtcRuntimeChannel.CONNECTING;
    dc.onopen = () => {
      this.readyState = RtcRuntimeChannel.OPEN;
      this._onopen?.(new Event('open'));
    };
    dc.onclose = () => this.onFatal();
    dc.onerror = () => this.onFatal();
    // A rejection (a throwing onmessage consumer, not handleMessage itself -
    // it never rejects on its own) is caught here rather than left to poison
    // the chain: .then() on a rejected promise skips every later handler, so
    // every subsequent frame would silently stop being processed.
    dc.onmessage = (e) => {
      this.inbox = this.inbox.then(() => this.handleMessage(e)).catch(() => this.onFatal());
    };
  }

  private async handleMessage(e: MessageEvent): Promise<void> {
    if (this.readyState !== RtcRuntimeChannel.OPEN) return;
    const frame = e.data instanceof ArrayBuffer ? new Uint8Array(e.data) : null;
    if (!frame || frame.byteLength > MAX_FRAME_BYTES) { this.onFatal(); return; }
    let opened;
    try {
      opened = await openFrame(this.aeadKey, frame);
    } catch {
      this.onFatal(); // tamper/decrypt failure closes the whole direct connection
      return;
    }
    if (opened.dir !== DIR_HOST_TO_CLIENT || opened.counter <= this.lastRecvCounter) { this.onFatal(); return; }
    this.lastRecvCounter = opened.counter;
    this.onmessage?.(new MessageEvent('message', { data: opened.plaintext }));
  }

  send(text: string): void {
    if (this.readyState !== RtcRuntimeChannel.OPEN) return;
    const counter = this.sendCounter++;
    // The counter is taken synchronously but sealing is async, so unchained
    // sends can reach the wire in the order their decrypts happen to settle.
    // The peer enforces a monotonic counter, so an inverted pair fatals a
    // legitimate connection - same reason inbound delivery is serialized.
    this.sendTail = this.sendTail
      .then(() => seal(this.aeadKey, DIR_CLIENT_TO_HOST, counter, text))
      .then((frame) => {
        if (frame.byteLength > MAX_FRAME_BYTES || this.readyState !== RtcRuntimeChannel.OPEN) return;
        this.dc.send(toArrayBuffer(frame));
      })
      .catch(() => this.onFatal());
  }

  /** Idempotent local teardown - detaches the raw channel and fires onclose once. */
  close(): void {
    if (this.readyState === RtcRuntimeChannel.CLOSED) return;
    this.readyState = RtcRuntimeChannel.CLOSED;
    this.dc.onopen = null;
    this.dc.onmessage = null;
    this.dc.onerror = null;
    this.dc.onclose = null;
    try { this.dc.close(); } catch { /* already closing */ }
    let evt: CloseEvent;
    try {
      evt = new CloseEvent('close', { code: 1000 });
    } catch {
      evt = Object.assign(new Event('close'), { code: 1000 }) as unknown as CloseEvent;
    }
    this.onclose?.(evt);
  }
}

/**
 * The "http" data channel counterpart of RelayHttpTunnel: same id-multiplexed
 * request/response framing (httpTunnelFraming.ts), sealed the same way, but
 * over an already-open data channel instead of a lazily-dialed relay WS.
 */
export class RtcHttpTunnel {
  private dead = false;
  private sendCounter = 0;
  private lastRecvCounter = -1;
  private readonly tracker = new PendingRequestTracker();
  private readonly dc: RTCDataChannel;
  private readonly aeadKey: CryptoKey;
  private readonly onFatal: () => void;
  // See RtcRuntimeChannel.inbox - serializes handleMessage so the async AEAD
  // decrypts settle in delivery order, keeping the monotonic-counter check
  // valid for concurrently-kicked-off responses.
  private inbox: Promise<void> = Promise.resolve();

  constructor(dc: RTCDataChannel, aeadKey: CryptoKey, onFatal: () => void) {
    this.dc = dc;
    this.aeadKey = aeadKey;
    this.onFatal = onFatal;
    dc.onclose = () => this.onFatal();
    dc.onerror = () => this.onFatal();
    // See RtcRuntimeChannel's identical onmessage - the .catch() keeps a
    // throwing consumer (tracker.resolve's caller) from poisoning the chain
    // for every later response.
    dc.onmessage = (e) => {
      this.inbox = this.inbox.then(() => this.handleMessage(e)).catch(() => this.onFatal());
    };
  }

  private async handleMessage(e: MessageEvent): Promise<void> {
    if (this.dead) return;
    const frame = e.data instanceof ArrayBuffer ? new Uint8Array(e.data) : null;
    if (!frame || frame.byteLength > MAX_FRAME_BYTES) { this.onFatal(); return; }
    let opened;
    try {
      opened = await openFrame(this.aeadKey, frame);
    } catch {
      this.onFatal();
      return;
    }
    if (opened.dir !== DIR_HOST_TO_CLIENT || opened.counter <= this.lastRecvCounter) { this.onFatal(); return; }
    this.lastRecvCounter = opened.counter;
    let wire: HttpTunnelResponseWire;
    try { wire = JSON.parse(opened.plaintext) as HttpTunnelResponseWire; } catch { return; }
    this.tracker.resolve(wire);
  }

  /** Seal an HTTP request frame and await the sealed response matched by id. */
  async request(method: RelayHttpMethod, path: string, body: string | null, contentType: string | null): Promise<RelayResponse> {
    if (this.dead || this.dc.readyState !== 'open') throw new Error('rtc http: channel not open');
    if (this.dc.bufferedAmount > MAX_BUFFERED_AMOUNT) throw new Error('rtc http: channel busy');

    const id = this.tracker.nextId();
    const payload = JSON.stringify(buildRequestWire(id, method, path, body, contentType));
    const counter = this.sendCounter++;
    const frame = await seal(this.aeadKey, DIR_CLIENT_TO_HOST, counter, payload);
    if (frame.byteLength > MAX_FRAME_BYTES) throw new Error('rtc http: request too large');
    if (this.dead || this.dc.readyState !== 'open') throw new Error('rtc http: channel closed before send');

    return new Promise<RelayResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.tracker.drop(id)) reject(new Error('rtc http: request timeout'));
      }, REQUEST_TIMEOUT_MS);
      this.tracker.register(id, resolve, reject, timer);
      try {
        this.dc.send(toArrayBuffer(frame));
      } catch {
        this.tracker.drop(id);
        clearTimeout(timer);
        reject(new Error('rtc http: send failed'));
      }
    });
  }

  /** Idempotent local teardown - rejects in-flight requests, detaches the raw channel. */
  close(): void {
    if (this.dead) return;
    this.dead = true;
    this.tracker.rejectAll(new Error('rtc http: tunnel closed'));
    this.dc.onopen = null;
    this.dc.onmessage = null;
    this.dc.onerror = null;
    this.dc.onclose = null;
    try { this.dc.close(); } catch { /* already closing */ }
  }
}

export interface RtcDirectConnection {
  readonly pc: RTCPeerConnection;
  readonly runtime: RtcRuntimeChannel;
  readonly http: RtcHttpTunnel;
  /** Tear down both channels and the peer connection. Idempotent. */
  close(): void;
}

interface RtcOfferResponse {
  sdp?: string;
}

/**
 * Attempt the WebRTC hole-punch: create the offerer peer connection + both
 * data channels, gather ICE (non-trickle, capped), exchange the offer/answer
 * over POST /rtc/offer, and await both channels opening. Rejects (closing the
 * peer connection first) on any failure - a 403 (killswitch off / invalid) is
 * just another rejection here; the caller's backoff keeps this from retrying
 * tightly.
 */
export async function openRtcDirect(sessionToken: string): Promise<RtcDirectConnection> {
  if (!isRtcDirectEligible()) throw new Error('rtc direct: not eligible');

  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  const runtimeDc = pc.createDataChannel('runtime');
  runtimeDc.binaryType = 'arraybuffer';
  const httpDc = pc.createDataChannel('http');
  httpDc.binaryType = 'arraybuffer';

  let torndown = false;
  // null until both wrapper channels are constructed (after key derivation);
  // teardown() can fire (via the catch below) before that point.
  let runtime: RtcRuntimeChannel | null = null;
  let http: RtcHttpTunnel | null = null;
  const teardown = () => {
    if (torndown) return;
    torndown = true;
    runtime?.close();
    http?.close();
    try { pc.close(); } catch { /* already closed */ }
  };

  try {
    const runtimeSalt = randomSalt();
    const httpSalt = randomSalt();
    const relayRoot = await deriveRelayRoot(sessionToken);
    const runtimeKey = await deriveAeadKey(relayRoot, runtimeSalt);
    const httpKey = await deriveAeadKey(relayRoot, httpSalt);

    runtime = new RtcRuntimeChannel(runtimeDc, runtimeKey, teardown);
    http = new RtcHttpTunnel(httpDc, httpKey, teardown);
    pc.addEventListener('connectionstatechange', () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') teardown();
    });

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await waitForIceGatheringComplete(pc, ICE_GATHER_TIMEOUT_MS);
    const offerSdp = pc.localDescription?.sdp;
    if (!offerSdp) throw new Error('rtc direct: no local description');

    const { response, status } = await authFetchWithStatus('/rtc/offer', {
      method: 'POST',
      body: {
        sdp: offerSdp,
        runtimeSalt: base64UrlNoPad(runtimeSalt),
        httpSalt: base64UrlNoPad(httpSalt),
      },
    });
    if (status === 403) throw new Error('rtc direct: offer rejected (403)');
    if (!response || !response.ok) throw new Error('rtc direct: offer request failed');
    const answer = await response.json() as RtcOfferResponse;
    if (!answer.sdp) throw new Error('rtc direct: no answer sdp');
    await pc.setRemoteDescription({ type: 'answer', sdp: answer.sdp });

    await Promise.all([
      waitForChannelOpen(runtimeDc, CHANNEL_OPEN_TIMEOUT_MS),
      waitForChannelOpen(httpDc, CHANNEL_OPEN_TIMEOUT_MS),
    ]);

    return { pc, runtime, http, close: teardown };
  } catch (err) {
    teardown();
    throw err instanceof Error ? err : new Error('rtc direct: open failed');
  }
}
