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
//
// Each channel opens with the same in-band rekey as the relay path
// (relayCrypto.ts): the first frame sealed once the raw data channel opens is
// {"c":"hello2"} under K0 (the salt-derived key from the offer); a v2 host
// replies with {"c":"hn",...} and the channel switches to K1, counters reset;
// a v1 host (anything else, or no reply within REKEY_TIMEOUT_MS) leaves the
// channel on K0. RtcRuntimeChannel's readyState/onopen and RtcHttpTunnel's
// request() gate are all held until this settles, per channel.

import {
  DIR_CLIENT_TO_HOST,
  DIR_HOST_TO_CLIENT,
  REKEY_HELLO2,
  REKEY_TIMEOUT_MS,
  base64UrlDecode,
  base64UrlNoPad,
  deriveAeadKey,
  deriveRekeyedAeadKey,
  deriveRelayRoot,
  open as openFrame,
  parseHostNonce,
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
 * unchanged. The raw channel is usually already open by the time this is
 * constructed, but readyState stays CONNECTING and `onopen` withheld until the
 * hello2/hn rekey handshake also settles - `onopen` then fires (async) the
 * moment a handler is assigned if that already happened first. A legacy
 * host's first (non-hn) frame is real data; it is queued and delivered to
 * `onmessage` once a handler is attached, since that handler is normally
 * assigned only after this class (and openRtcDirect) resolve the handshake.
 * The queue holds one frame; a shipped host sends nothing else until the
 * client subscribes, which can't happen before onopen, so a second frame
 * arriving pre-attach (which would be dropped, not queued) is unreachable.
 */
export class RtcRuntimeChannel {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  readyState: number;
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

  private _onmessage: ((e: MessageEvent) => void) | null = null;
  get onmessage(): ((e: MessageEvent) => void) | null { return this._onmessage; }
  set onmessage(handler: ((e: MessageEvent) => void) | null) {
    this._onmessage = handler;
    if (handler && this.pendingMessage !== null) {
      const data = this.pendingMessage;
      this.pendingMessage = null;
      queueMicrotask(() => this._onmessage === handler && handler(new MessageEvent('message', { data })));
    }
  }

  private sendCounter = 0;
  // Serializes outbound writes so frames reach the wire in counter order.
  private sendTail: Promise<void> = Promise.resolve();
  private lastRecvCounter = -1;
  private readonly dc: RTCDataChannel;
  private readonly relayRoot: Uint8Array;
  private readonly connSalt: Uint8Array;
  private aeadKey: CryptoKey;
  private readonly onFatal: () => void;
  // Chains each handleMessage call onto the previous one's completion so the
  // (async) AEAD decrypts settle in delivery order - SCTP delivers this
  // channel's frames in order, but nothing otherwise guarantees two
  // concurrently-kicked-off decrypts RESOLVE in that same order, which would
  // make the monotonic-counter check misfire on legitimate back-to-back frames.
  private inbox: Promise<void> = Promise.resolve();
  // True once the post-open hello2/hn rekey handshake has resolved, either by
  // switching aeadKey to K1 or falling back to K0 for a legacy host.
  private rekeyDone = false;
  private handshakeStarted = false;
  private rekeyTimer: ReturnType<typeof setTimeout> | undefined;
  // A legacy host's first (non-hn) frame, held until onmessage is attached.
  private pendingMessage: string | null = null;

  constructor(dc: RTCDataChannel, relayRoot: Uint8Array, connSalt: Uint8Array, aeadKey: CryptoKey, onFatal: () => void) {
    this.dc = dc;
    this.relayRoot = relayRoot;
    this.connSalt = connSalt;
    this.aeadKey = aeadKey;
    this.onFatal = onFatal;
    this.readyState = RtcRuntimeChannel.CONNECTING;
    dc.onopen = () => { void this.beginRekey(); };
    dc.onclose = () => this.onFatal();
    dc.onerror = () => this.onFatal();
    // A rejection (a throwing onmessage consumer, not handleMessage itself -
    // it never rejects on its own) is caught here rather than left to poison
    // the chain: .then() on a rejected promise skips every later handler, so
    // every subsequent frame would silently stop being processed.
    dc.onmessage = (e) => {
      this.inbox = this.inbox.then(() => this.handleMessage(e)).catch(() => this.onFatal());
    };
    if (dc.readyState === 'open') void this.beginRekey();
  }

  /** Seal {"c":"hello2"} under K0 as the first frame and arm the fallback timeout. */
  private async beginRekey(): Promise<void> {
    if (this.handshakeStarted) return;
    this.handshakeStarted = true;
    let helloFrame: Uint8Array;
    try {
      // Consumes sendCounter's 0 so a legacy K0 fallback's first real frame
      // (which does NOT reset the counter) never reuses it under the same key.
      helloFrame = await seal(this.aeadKey, DIR_CLIENT_TO_HOST, this.sendCounter++, REKEY_HELLO2);
    } catch {
      this.onFatal();
      return;
    }
    if (this.readyState === RtcRuntimeChannel.CLOSED || this.dc.readyState !== 'open') return;
    try {
      this.dc.send(toArrayBuffer(helloFrame));
    } catch {
      this.onFatal();
      return;
    }
    this.rekeyTimer = setTimeout(() => {
      // No host frame at all within the window ⇒ legacy host; fall back to K0.
      if (!this.rekeyDone) this.finishRekey(null);
    }, REKEY_TIMEOUT_MS);
  }

  private async handleMessage(e: MessageEvent): Promise<void> {
    if (this.readyState === RtcRuntimeChannel.CLOSED) return;
    const frame = e.data instanceof ArrayBuffer ? new Uint8Array(e.data) : null;
    if (!frame || frame.byteLength > MAX_FRAME_BYTES) { this.onFatal(); return; }

    if (!this.rekeyDone) {
      await this.handleRekeyFrame(frame);
      return;
    }

    let opened;
    try {
      opened = await openFrame(this.aeadKey, frame);
    } catch {
      this.onFatal(); // tamper/decrypt failure closes the whole direct connection
      return;
    }
    if (opened.dir !== DIR_HOST_TO_CLIENT || opened.counter <= this.lastRecvCounter) { this.onFatal(); return; }
    if (parseHostNonce(opened.plaintext) !== null) {
      // An hn frame after the handshake already settled means the host and
      // client disagree on the key (e.g. the host switched to K1 only after
      // our fallback timer had already committed us to K0) - unrecoverable.
      this.onFatal();
      return;
    }
    this.lastRecvCounter = opened.counter;
    this.onmessage?.(new MessageEvent('message', { data: opened.plaintext }));
  }

  /** The first frame after hello2: either the v2 host's hn reply, or a legacy host's first real frame. */
  private async handleRekeyFrame(frame: Uint8Array): Promise<void> {
    clearTimeout(this.rekeyTimer);
    let opened;
    try {
      opened = await openFrame(this.aeadKey, frame);
    } catch {
      // Tag-verify failure is a channel error, not a legacy-fallback signal.
      this.onFatal();
      return;
    }
    if (opened.dir !== DIR_HOST_TO_CLIENT) { this.onFatal(); return; }

    const hn = parseHostNonce(opened.plaintext);
    if (hn) {
      let k1: CryptoKey;
      try {
        k1 = await deriveRekeyedAeadKey(this.relayRoot, this.connSalt, base64UrlDecode(hn));
      } catch {
        this.onFatal();
        return;
      }
      this.aeadKey = k1;
      this.sendCounter = 0;
      this.lastRecvCounter = -1;
      this.finishRekey(null);
      return;
    }

    // Legacy host: this frame is real multiplex data under K0.
    this.lastRecvCounter = opened.counter;
    this.finishRekey(opened.plaintext);
  }

  /** Resolve the rekey handshake: go OPEN, then deliver a legacy-fallback frame (queued if no onmessage yet). */
  private finishRekey(pendingPlaintext: string | null): void {
    if (this.rekeyDone || this.readyState === RtcRuntimeChannel.CLOSED) return;
    clearTimeout(this.rekeyTimer);
    this.rekeyDone = true;
    this.readyState = RtcRuntimeChannel.OPEN;
    this._onopen?.(new Event('open'));
    if (pendingPlaintext !== null) {
      if (this._onmessage) {
        this._onmessage(new MessageEvent('message', { data: pendingPlaintext }));
      } else {
        this.pendingMessage = pendingPlaintext;
      }
    }
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
    clearTimeout(this.rekeyTimer);
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
 * over an already-open data channel instead of a lazily-dialed relay WS. Runs
 * the identical hello2/hn rekey handshake as RtcRuntimeChannel; `request()`
 * gates on it the same way RelayHttpTunnel's `ready` does.
 */
export class RtcHttpTunnel {
  private dead = false;
  private sendCounter = 0;
  // Serializes outbound writes so request frames reach the wire in counter order.
  private sendTail: Promise<void> = Promise.resolve();
  private lastRecvCounter = -1;
  private readonly tracker = new PendingRequestTracker();
  private readonly dc: RTCDataChannel;
  private readonly relayRoot: Uint8Array;
  private readonly connSalt: Uint8Array;
  private aeadKey: CryptoKey;
  private readonly onFatal: () => void;
  // See RtcRuntimeChannel.inbox - serializes handleMessage so the async AEAD
  // decrypts settle in delivery order, keeping the monotonic-counter check
  // valid for concurrently-kicked-off responses.
  private inbox: Promise<void> = Promise.resolve();
  // True once the post-open hello2/hn rekey handshake has resolved, either by
  // switching aeadKey to K1 or falling back to K0 for a legacy host.
  private rekeyDone = false;
  private handshakeStarted = false;
  private rekeyTimer: ReturnType<typeof setTimeout> | undefined;
  // Resolves once the rekey handshake settles; request() awaits it so no real
  // request is ever sealed under a key the handshake might still replace.
  private readonly ready: Promise<void>;
  private readyResolve!: () => void;

  constructor(dc: RTCDataChannel, relayRoot: Uint8Array, connSalt: Uint8Array, aeadKey: CryptoKey, onFatal: () => void) {
    this.dc = dc;
    this.relayRoot = relayRoot;
    this.connSalt = connSalt;
    this.aeadKey = aeadKey;
    this.onFatal = onFatal;
    this.ready = new Promise((resolve) => { this.readyResolve = resolve; });
    dc.onopen = () => { void this.beginRekey(); };
    dc.onclose = () => this.onFatal();
    dc.onerror = () => this.onFatal();
    // See RtcRuntimeChannel's identical onmessage - the .catch() keeps a
    // throwing consumer (tracker.resolve's caller) from poisoning the chain
    // for every later response.
    dc.onmessage = (e) => {
      this.inbox = this.inbox.then(() => this.handleMessage(e)).catch(() => this.onFatal());
    };
    if (dc.readyState === 'open') void this.beginRekey();
  }

  /** Seal {"c":"hello2"} under K0 as the first request frame and arm the fallback timeout. */
  private async beginRekey(): Promise<void> {
    if (this.handshakeStarted) return;
    this.handshakeStarted = true;
    let helloFrame: Uint8Array;
    try {
      // Consumes sendCounter's 0 so a legacy K0 fallback's first real frame
      // (which does NOT reset the counter) never reuses it under the same key.
      helloFrame = await seal(this.aeadKey, DIR_CLIENT_TO_HOST, this.sendCounter++, REKEY_HELLO2);
    } catch {
      this.onFatal();
      return;
    }
    if (this.dead || this.dc.readyState !== 'open') return;
    try {
      this.dc.send(toArrayBuffer(helloFrame));
    } catch {
      this.onFatal();
      return;
    }
    this.rekeyTimer = setTimeout(() => {
      // No host frame at all within the window ⇒ legacy host; fall back to K0.
      if (!this.rekeyDone) this.finishRekey();
    }, REKEY_TIMEOUT_MS);
  }

  private async handleMessage(e: MessageEvent): Promise<void> {
    if (this.dead) return;
    const frame = e.data instanceof ArrayBuffer ? new Uint8Array(e.data) : null;
    if (!frame || frame.byteLength > MAX_FRAME_BYTES) { this.onFatal(); return; }

    if (!this.rekeyDone) {
      await this.handleRekeyFrame(frame);
      return;
    }

    let opened;
    try {
      opened = await openFrame(this.aeadKey, frame);
    } catch {
      this.onFatal();
      return;
    }
    if (opened.dir !== DIR_HOST_TO_CLIENT || opened.counter <= this.lastRecvCounter) { this.onFatal(); return; }
    if (parseHostNonce(opened.plaintext) !== null) {
      // An hn frame after the handshake already settled means the host and
      // client disagree on the key (e.g. the host switched to K1 only after
      // our fallback timer had already committed us to K0) - unrecoverable.
      this.onFatal();
      return;
    }
    this.lastRecvCounter = opened.counter;
    let wire: HttpTunnelResponseWire;
    try { wire = JSON.parse(opened.plaintext) as HttpTunnelResponseWire; } catch { return; }
    this.tracker.resolve(wire);
  }

  /** The first frame after hello2: either the v2 host's hn reply, or a legacy host's first real response. */
  private async handleRekeyFrame(frame: Uint8Array): Promise<void> {
    clearTimeout(this.rekeyTimer);
    let opened;
    try {
      opened = await openFrame(this.aeadKey, frame);
    } catch {
      // Tag-verify failure is a channel error, not a legacy-fallback signal.
      this.onFatal();
      return;
    }
    if (opened.dir !== DIR_HOST_TO_CLIENT) { this.onFatal(); return; }

    const hn = parseHostNonce(opened.plaintext);
    if (hn) {
      let k1: CryptoKey;
      try {
        k1 = await deriveRekeyedAeadKey(this.relayRoot, this.connSalt, base64UrlDecode(hn));
      } catch {
        this.onFatal();
        return;
      }
      this.aeadKey = k1;
      this.sendCounter = 0;
      this.lastRecvCounter = -1;
      this.finishRekey();
      return;
    }

    // Legacy host: this frame is a real response (e.g. its 403/id:0 answer to
    // hello2); route it through the normal id match, a no-op on an unknown id.
    this.lastRecvCounter = opened.counter;
    let wire: HttpTunnelResponseWire | null = null;
    try { wire = JSON.parse(opened.plaintext) as HttpTunnelResponseWire; } catch { /* not JSON: nothing to match */ }
    if (wire) this.tracker.resolve(wire);
    this.finishRekey();
  }

  private finishRekey(): void {
    if (this.rekeyDone || this.dead) return;
    clearTimeout(this.rekeyTimer);
    this.rekeyDone = true;
    this.readyResolve();
  }

  /** Seal an HTTP request frame and await the sealed response matched by id. */
  async request(method: RelayHttpMethod, path: string, body: string | null, contentType: string | null): Promise<RelayResponse> {
    if (this.dead) throw new Error('rtc http: channel not open');
    if (!this.rekeyDone) {
      // Nothing armed the handshake at all (the raw channel never opened) - a
      // request made against it will never proceed, so fail fast instead of
      // hanging on `ready` forever.
      if (!this.handshakeStarted) throw new Error('rtc http: channel not open');
      await this.ready;
    }
    if (this.dead || this.dc.readyState !== 'open') throw new Error('rtc http: channel not open');
    if (this.dc.bufferedAmount > MAX_BUFFERED_AMOUNT) throw new Error('rtc http: channel busy');

    const id = this.tracker.nextId();
    const payload = JSON.stringify(buildRequestWire(id, method, path, body, contentType));
    const counter = this.sendCounter++;

    return new Promise<RelayResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.tracker.drop(id)) reject(new Error('rtc http: request timeout'));
      }, REQUEST_TIMEOUT_MS);
      this.tracker.register(id, resolve, reject, timer);
      const fail = (message: string) => {
        this.tracker.drop(id);
        clearTimeout(timer);
        reject(new Error(message));
      };
      // Counters are taken synchronously but sealing is async, so concurrent
      // requests would otherwise reach the wire in whichever order their seals
      // settled. The peer enforces a monotonic counter, so an inverted pair
      // fatals the connection.
      this.sendTail = this.sendTail.then(async () => {
        let frame: Uint8Array;
        try {
          frame = await seal(this.aeadKey, DIR_CLIENT_TO_HOST, counter, payload);
        } catch {
          fail('rtc http: seal failed');
          return;
        }
        if (frame.byteLength > MAX_FRAME_BYTES) { fail('rtc http: request too large'); return; }
        if (this.dead || this.dc.readyState !== 'open') { fail('rtc http: channel closed before send'); return; }
        try {
          this.dc.send(toArrayBuffer(frame));
        } catch {
          fail('rtc http: send failed');
        }
      });
    });
  }

  /** Idempotent local teardown - rejects in-flight requests, detaches the raw channel. */
  close(): void {
    if (this.dead) return;
    this.dead = true;
    clearTimeout(this.rekeyTimer);
    // Unblock any request() awaiting the handshake gate; the post-await dead
    // check then rejects it.
    this.readyResolve();
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
 * over POST /rtc/offer, and await both channels opening AND the runtime
 * channel's own hello2/hn rekey handshake settling (the caller checks
 * conn.runtime.readyState synchronously). Rejects (closing the peer
 * connection first) on any failure - a 403 (killswitch off / invalid) is just
 * another rejection here; the caller's backoff keeps this from retrying
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

    runtime = new RtcRuntimeChannel(runtimeDc, relayRoot, runtimeSalt, runtimeKey, teardown);
    http = new RtcHttpTunnel(httpDc, relayRoot, httpSalt, httpKey, teardown);
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

    // useMultiplexSocket checks conn.runtime.readyState synchronously right
    // after this resolves, so the runtime channel's own hello2/hn rekey
    // handshake (armed the moment its raw data channel opened, above) must
    // also have settled - OPEN via K1 or the legacy K0 fallback - before this
    // returns.
    if (runtime.readyState !== RtcRuntimeChannel.OPEN) {
      await new Promise<void>((resolve, reject) => {
        runtime!.onopen = () => resolve();
        runtime!.onclose = () => reject(new Error('rtc direct: runtime channel closed during rekey'));
      });
    }

    return { pc, runtime, http, close: teardown };
  } catch (err) {
    teardown();
    throw err instanceof Error ? err : new Error('rtc direct: open failed');
  }
}
