// Cloud-relay transport for the multiplex client.
//
// RelayChannel presents a minimal WebSocket-like surface (readyState +
// onopen/onmessage/onclose/onerror + send/close) so useMultiplexSocket can
// drive it exactly like the LAN /ws socket. The difference is end-to-end:
//   - outgoing TEXT (multiplex {t,d}/{sub}/{unsub} JSON) is AEAD-sealed to
//     BINARY before it leaves the browser;
//   - incoming BINARY is opened (tag-verified) back to TEXT and surfaced via
//     onmessage as a string, so the hook's existing string-only onmessage
//     handler works unchanged.
//
// Connection handshake (relay wire protocol):
//   1. open WSS to the relay URL;
//   2. send the client hello TEXT {v:1, role:"client", rid, salt:<b64url 16B>};
//   3. wait for the relay's TEXT {"e":"peer-up"} — only THEN is onopen fired
//      (the LAN socket's onopen analogue: the host is present and ready);
//   4. after peer-up, BINARY frames carry the encrypted multiplex stream.
// A peer-down / close / handshake timeout fires onclose, returning the hook to
// its normal backoff. The relay itself never sees the AEAD key — it only sees
// rid + connSalt, both public.

import {
  DIR_CLIENT_TO_HOST,
  DIR_HOST_TO_CLIENT,
  base64UrlNoPad,
  deriveAeadKey,
  derivePairRoot,
  deriveRelayRoot,
  deriveRid,
  open as openFrame,
  seal,
} from '../api/relayCrypto';

// How long to wait for the relay's peer-up after sending the client hello
// before giving up and falling back to backoff. Short: if the host isn't
// holding its relay socket (relay disabled, or no PC online) there's nothing
// to wait for, and a long stall would delay the LAN retry loop.
export const RELAY_PEER_UP_TIMEOUT_MS = 6000;

// Relay close code for a duplicate client/host on the same rid (wire protocol).
const RELAY_CLOSE_DUPLICATE = 4409;

export class RelayChannel {
  // WebSocket-compatible constants so callers can compare readyState the same
  // way they do for the native socket.
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  readyState = RelayChannel.CONNECTING;

  // Handler shapes mirror the DOM WebSocket's so a RelayChannel is structurally
  // a MultiplexTransport. onmessage always carries decrypted TEXT as a string.
  onopen: ((e: Event) => void) | null = null;
  onmessage: ((e: MessageEvent) => void) | null = null;
  onclose: ((e: CloseEvent) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;

  private readonly url: string;
  private readonly token: string;
  private ws: WebSocket | null = null;
  private aeadKey: CryptoKey | null = null;
  private sendCounter = 0;
  private peerUp = false;
  private peerUpTimer: ReturnType<typeof setTimeout> | undefined;
  // connSalt is fresh per connection ⇒ a fresh aeadKey ⇒ the (dir,counter)
  // nonce space never repeats across connections.
  private readonly connSalt: Uint8Array;

  constructor(url: string, token: string) {
    this.url = url;
    this.token = token;
    this.connSalt = crypto.getRandomValues(new Uint8Array(16));
  }

  /** Begin connecting: derive keys, open the relay WSS, send the client hello. */
  async connect(): Promise<void> {
    let rid: string;
    try {
      const relayRoot = await deriveRelayRoot(this.token);
      rid = await deriveRid(relayRoot);
      this.aeadKey = await deriveAeadKey(relayRoot, this.connSalt);
    } catch {
      // Crypto/derivation failure (e.g. no token): treat as a failed open.
      this.fail();
      return;
    }
    if (this.readyState === RelayChannel.CLOSED) return; // closed during derivation

    let socket: WebSocket;
    try {
      socket = new WebSocket(this.url);
    } catch {
      this.fail();
      return;
    }
    socket.binaryType = 'arraybuffer';
    this.ws = socket;

    socket.onopen = () => {
      // The relay socket is open, but the PEER (host) may not be present yet.
      // Send the client hello and wait for peer-up before reporting open to
      // the hook. Arm a timeout so a missing host doesn't stall the retry loop.
      // nh:1 opts into the relay's {"e":"no-host"} advisory so a missing host
      // is reported at once instead of only after the peer-up timeout fires.
      const hello = JSON.stringify({ v: 1, role: 'client', rid, salt: base64UrlNoPad(this.connSalt), nh: 1 });
      try {
        socket.send(hello);
      } catch {
        this.fail();
        return;
      }
      this.peerUpTimer = setTimeout(() => {
        if (!this.peerUp) this.close(); // no host on the relay → back to backoff
      }, RELAY_PEER_UP_TIMEOUT_MS);
    };

    socket.onmessage = (e) => { void this.handleMessage(e); };

    socket.onclose = (e) => {
      clearTimeout(this.peerUpTimer);
      if (this.readyState === RelayChannel.CLOSED) return; // we initiated it
      this.readyState = RelayChannel.CLOSED;
      // 4409 = duplicate on this rid; surface a normal close so the hook backs
      // off rather than treating it as the 1008 killswitch revoke.
      this.emitClose(e.code === RELAY_CLOSE_DUPLICATE ? 1006 : e.code);
    };

    socket.onerror = () => {
      // Mirror the LAN socket's onerror→close: an errored relay socket is a
      // failed connection; let onclose drive the fallback/backoff.
      try { socket.close(); } catch { /* already closing */ }
    };
  }

  private async handleMessage(e: MessageEvent): Promise<void> {
    if (!this.peerUp) {
      // Pre-peer-up: the only expected message is the relay's TEXT control
      // frame. {"e":"peer-up"} promotes us to OPEN; {"e":"no-host"} means the PC
      // isn't on the relay, so close fast and let the hook back off rather than
      // waiting out the peer-up timeout; anything else (peer-down, unexpected)
      // also ends the channel.
      if (typeof e.data !== 'string') { this.close(); return; }
      let parsed: { e?: string };
      try { parsed = JSON.parse(e.data) as { e?: string }; } catch { this.close(); return; }
      if (parsed.e === 'peer-up') {
        clearTimeout(this.peerUpTimer);
        this.peerUp = true;
        this.readyState = RelayChannel.OPEN;
        this.onopen?.(new Event('open'));
      } else {
        // no-host, peer-down before peer-up, or an unknown control frame.
        this.close();
      }
      return;
    }

    // After peer-up: TEXT is a relay control frame (peer-down); BINARY is an
    // encrypted host→client multiplex frame.
    if (typeof e.data === 'string') {
      let parsed: { e?: string };
      try { parsed = JSON.parse(e.data) as { e?: string }; } catch { return; }
      if (parsed.e === 'peer-down') this.close();
      return;
    }

    if (!this.aeadKey) return;
    const frame = e.data instanceof ArrayBuffer ? new Uint8Array(e.data) : null;
    if (!frame) return;
    try {
      const opened = await openFrame(this.aeadKey, frame);
      // Only accept host→client frames; reject our own direction reflected back.
      if (opened.dir !== DIR_HOST_TO_CLIENT) { this.close(); return; }
      this.onmessage?.(new MessageEvent('message', { data: opened.plaintext }));
    } catch {
      // Tag-verify failure ⇒ forged/tampered frame ⇒ drop it and close the
      // channel per the crypto contract.
      this.close();
    }
  }

  /** Seal a multiplex TEXT frame and send it as BINARY to the relay. */
  send(text: string): void {
    if (!this.peerUp || !this.aeadKey || !this.ws) return;
    const counter = this.sendCounter++;
    void seal(this.aeadKey, DIR_CLIENT_TO_HOST, counter, text)
      .then((frame) => {
        if (this.readyState === RelayChannel.OPEN && this.ws) {
          // Copy into a standalone ArrayBuffer for the WS send (seal() returns
          // a fresh tightly-packed Uint8Array, so its buffer is exactly the
          // frame bytes).
          const out = new ArrayBuffer(frame.byteLength);
          new Uint8Array(out).set(frame);
          this.ws.send(out);
        }
      })
      .catch(() => this.close());
  }

  close(): void {
    clearTimeout(this.peerUpTimer);
    const wasClosed = this.readyState === RelayChannel.CLOSED;
    this.readyState = RelayChannel.CLOSED;
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onerror = null;
      // Detach onclose so our own close() doesn't re-enter onclose below.
      this.ws.onclose = null;
      try { this.ws.close(); } catch { /* already closing */ }
      this.ws = null;
    }
    if (!wasClosed) this.emitClose(1000);
  }

  // Report a failed open (never reached OPEN) as a generic close so the hook
  // resumes its normal backoff rather than the killswitch-revoke path.
  private fail(): void {
    if (this.readyState === RelayChannel.CLOSED) return;
    this.readyState = RelayChannel.CLOSED;
    this.emitClose(1006);
  }

  private emitClose(code: number): void {
    // CloseEvent isn't constructable in every JS runtime (some test envs); fall
    // back to a minimal Event carrying the code so the hook can still read it.
    let evt: CloseEvent;
    try {
      evt = new CloseEvent('close', { code });
    } catch {
      evt = Object.assign(new Event('close'), { code }) as unknown as CloseEvent;
    }
    this.onclose?.(evt);
  }
}

// How long to wait for the relay's peer-up + the sealed claim reply during a
// pair-over-relay handshake before giving up. Slightly longer than the runtime
// peer-up timeout: the host reconciles a fresh pair-rid host link on demand
// (relay+remote on), and the PC also has to mint a session token before it can
// answer, so the round-trip is heavier than a runtime peer-up alone.
export const RELAY_PAIR_TIMEOUT_MS = 12000;

/** A successful relay claim: the PC minted a session token for this phone. */
export interface RelayClaimOk {
  ok: true;
  sessionToken: string;
  machineName?: string;
  spki?: string;
}

/** A failed relay claim (host reachable but refused: expired token, etc.). */
export interface RelayClaimErr {
  ok: false;
  error: string;
}

export type RelayClaimResult = RelayClaimOk | RelayClaimErr;

// Wire shape of the single sealed reply the PC sends back over the pair-rid
// relay link: either a claim-ok carrying the new session token + host identity,
// or a claim-err carrying a human-readable reason.
interface SealedClaimReply {
  type?: string;
  sessionToken?: string;
  machineName?: string;
  spki?: string;
  error?: string;
}

/**
 * Pair a brand-new phone over the cloud relay (Phase 1 internet pairing).
 *
 * Unlike RelayChannel (a long-lived runtime transport keyed off a SESSION
 * token), this is a one-shot request/response keyed off the QR `pair` token:
 *   1. derive pairRoot from the pair token, rid_pair via deriveRid, and the
 *      claim AEAD key via deriveAeadKey(pairRoot, freshConnSalt);
 *   2. open the relay WSS and send the client hello with rid_pair + connSalt;
 *   3. on peer-up, send ONE sealed frame {"type":"claim","deviceName":<name>,
 *      "deviceId":<id>} (dir=client→host); possession of the token is proven by
 *      the PC's successful AEAD decrypt under the pair-derived key. `deviceId` is
 *      a stable per-device id so the PC dedups a re-pair of the same device
 *      (replaces its session) instead of minting a duplicate;
 *   4. await ONE sealed reply {"type":"claim-ok",sessionToken,machineName,spki}
 *      (or {"type":"claim-err",error}); resolve and close.
 *
 * Reuses the exact seal/open crypto + relay wire protocol as the runtime
 * transport; the only difference is the pre-pair derivation and the
 * single-shot lifecycle. Rejects on any transport/handshake/crypto failure so
 * the caller can fall back (e.g. to a "generate a fresh QR" surface).
 */
export async function pairOverRelay(url: string, pairToken: string, deviceName: string, deviceId: string): Promise<RelayClaimResult> {
  const pairRoot = await derivePairRoot(pairToken);
  const ridPair = await deriveRid(pairRoot);
  const connSalt = crypto.getRandomValues(new Uint8Array(16));
  const claimKey = await deriveAeadKey(pairRoot, connSalt);

  return new Promise<RelayClaimResult>((resolve, reject) => {
    let socket: WebSocket;
    try {
      socket = new WebSocket(url);
    } catch (err) {
      reject(err instanceof Error ? err : new Error('relay open failed'));
      return;
    }
    socket.binaryType = 'arraybuffer';

    let peerUp = false;
    let settled = false;
    // Once a BINARY claim-reply frame has arrived, the claim is authoritative:
    // the PC answered (and, post-claim, immediately consumes the single-use
    // token and unregisters rid_pair, which makes the relay peer-down/close the
    // channel as NORMAL cleanup). On WebKit that close can win the race against
    // the async WebCrypto open() of the just-received reply, so a close/error/
    // peer-down arriving AFTER a reply frame MUST NOT reject — the in-flight
    // decrypt of the received frame is the source of truth. Reject paths are
    // guarded by this flag; only the no-reply cases (no peer-up, timeout,
    // real error before any reply) still reject.
    let responseReceived = false;
    const timer = setTimeout(() => fail(new Error('relay pair timeout')), RELAY_PAIR_TIMEOUT_MS);

    const cleanup = () => {
      clearTimeout(timer);
      socket.onopen = null;
      socket.onmessage = null;
      socket.onerror = null;
      socket.onclose = null;
      try { socket.close(); } catch { /* already closing */ }
    };
    const succeed = (result: RelayClaimResult) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };
    // Reject the claim outright (used for real errors of the reply frame
    // itself — bad tag, wrong direction, unparseable reply — which are real
    // failures regardless of the close race).
    const abort = (err: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    };
    const fail = (err: Error) => {
      // A reply frame already arrived ⇒ the claim is being resolved from that
      // frame's decrypt; a subsequent close/error/peer-down is normal post-claim
      // cleanup and must not turn a successful claim into a failure.
      if (responseReceived) return;
      abort(err);
    };

    socket.onopen = () => {
      const hello = JSON.stringify({ v: 1, role: 'client', rid: ridPair, salt: base64UrlNoPad(connSalt) });
      try {
        socket.send(hello);
      } catch {
        fail(new Error('relay hello send failed'));
      }
    };

    socket.onmessage = (e) => { void handleMessage(e); };

    socket.onerror = () => fail(new Error('relay socket error'));
    socket.onclose = () => fail(new Error('relay closed before claim reply'));

    const handleMessage = async (e: MessageEvent): Promise<void> => {
      if (settled) return;
      if (!peerUp) {
        // Pre-peer-up: the only expected message is the relay's TEXT control
        // frame. {"e":"peer-up"} means the PC's pair-rid host link is present;
        // send the sealed claim. Anything else (peer-down, no host) fails.
        if (typeof e.data !== 'string') { fail(new Error('unexpected binary before peer-up')); return; }
        let ctrl: { e?: string };
        try { ctrl = JSON.parse(e.data) as { e?: string }; } catch { fail(new Error('bad relay control frame')); return; }
        if (ctrl.e !== 'peer-up') { fail(new Error(`relay control: ${ctrl.e ?? 'unknown'}`)); return; }
        peerUp = true;
        try {
          const claim = JSON.stringify({ type: 'claim', deviceName, deviceId });
          const frame = await seal(claimKey, DIR_CLIENT_TO_HOST, 0, claim);
          const out = new ArrayBuffer(frame.byteLength);
          new Uint8Array(out).set(frame);
          socket.send(out);
        } catch {
          fail(new Error('claim seal/send failed'));
        }
        return;
      }

      // After peer-up: TEXT is a relay control frame (peer-down); BINARY is the
      // single sealed claim reply from the PC.
      if (typeof e.data === 'string') {
        fail(new Error('relay peer-down before claim reply'));
        return;
      }
      const frameBytes = e.data instanceof ArrayBuffer ? new Uint8Array(e.data) : null;
      if (!frameBytes) { fail(new Error('malformed relay frame')); return; }
      // A BINARY frame IS the claim reply: mark it received NOW, synchronously,
      // before the async open() resolves. From here on the claim is settled by
      // this frame's decrypt — any close/error/peer-down the PC's post-claim
      // cleanup triggers is ignored (the fail() guard above), and the in-flight
      // open() is never aborted.
      responseReceived = true;
      let opened;
      try {
        opened = await openFrame(claimKey, frameBytes);
      } catch {
        // Tag-verify failure ⇒ forged/tampered reply ⇒ abort per the contract.
        // This is a real failure of the received frame, so it rejects even
        // though responseReceived is set (it is NOT the post-claim close race).
        abort(new Error('claim reply tag verify failed'));
        return;
      }
      if (opened.dir !== DIR_HOST_TO_CLIENT) { abort(new Error('claim reply wrong direction')); return; }
      let reply: SealedClaimReply;
      try { reply = JSON.parse(opened.plaintext) as SealedClaimReply; } catch { abort(new Error('claim reply not JSON')); return; }
      if (reply.type === 'claim-ok' && reply.sessionToken) {
        succeed({ ok: true, sessionToken: reply.sessionToken, machineName: reply.machineName, spki: reply.spki });
      } else if (reply.type === 'claim-err') {
        succeed({ ok: false, error: reply.error || 'pair rejected' });
      } else {
        abort(new Error('unexpected claim reply'));
      }
    };
  });
}
