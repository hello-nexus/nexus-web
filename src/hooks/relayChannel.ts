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
//   3. wait for the relay's TEXT {"e":"peer-up"};
//   4. seal {"c":"hello2"} under K0 as the first BINARY frame, then wait up to
//      REKEY_TIMEOUT_MS for the host's reply: an {"c":"hn",...} frame rekeys
//      to K1 (defeats a same-connSalt replay across connections); anything
//      else, or no reply, falls back to K0 (a legacy host) - either way onopen
//      fires only once this resolves (the LAN socket's onopen analogue: the
//      host is present, ready, and the channel key is settled);
//   5. after that, BINARY frames carry the encrypted multiplex stream.
// A peer-down / close / handshake timeout fires onclose, returning the hook to
// its normal backoff. The relay itself never sees the AEAD key - it only sees
// rid + connSalt, both public.

import {
  DIR_CLIENT_TO_HOST,
  DIR_HOST_TO_CLIENT,
  REKEY_HELLO2,
  REKEY_TIMEOUT_MS,
  base64UrlDecode,
  base64UrlNoPad,
  deriveAeadKey,
  deriveRekeyedAeadKey,
  derivePairRoot,
  deriveRelayRoot,
  deriveRid,
  open as openFrame,
  parseHostNonce,
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
  private relayRoot: Uint8Array | null = null;
  private aeadKey: CryptoKey | null = null;
  private sendCounter = 0;
  private peerUp = false;
  private peerUpTimer: ReturnType<typeof setTimeout> | undefined;
  // connSalt is fresh per connection ⇒ a fresh aeadKey ⇒ the (dir,counter)
  // nonce space never repeats across connections.
  private readonly connSalt: Uint8Array;
  // True once the post-peer-up hello2/hn rekey handshake has resolved, either
  // by switching aeadKey to K1 or falling back to K0 for a legacy host. Gates
  // onopen and multiplex frame handling.
  private rekeyDone = false;
  private rekeyTimer: ReturnType<typeof setTimeout> | undefined;
  // Chains each handleMessage call onto the previous one's completion so the
  // (async) AEAD decrypts settle in delivery order - the relay WS delivers
  // frames in order, but nothing otherwise guarantees two concurrently-kicked-
  // off decrypts RESOLVE in that order, which would let a second BINARY frame
  // arriving before the first settles slip into handleRekeyFrame while
  // rekeyDone is still false and have its plaintext silently discarded.
  private inbox: Promise<void> = Promise.resolve();

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
      this.relayRoot = relayRoot;
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

    socket.onmessage = (e) => {
      this.inbox = this.inbox.then(() => this.handleMessage(e)).catch(() => this.close());
    };

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
        void this.beginRekey();
      } else {
        // no-host, peer-down before peer-up, or an unknown control frame.
        this.close();
      }
      return;
    }

    // After peer-up: TEXT is a relay control frame (peer-down); BINARY is an
    // encrypted host→client frame - the rekey handshake's first reply until
    // rekeyDone, then the multiplex stream.
    if (typeof e.data === 'string') {
      let parsed: { e?: string };
      try { parsed = JSON.parse(e.data) as { e?: string }; } catch { return; }
      if (parsed.e === 'peer-down') this.close();
      return;
    }

    if (!this.aeadKey) return;
    const frame = e.data instanceof ArrayBuffer ? new Uint8Array(e.data) : null;
    if (!frame) return;

    if (!this.rekeyDone) {
      await this.handleRekeyFrame(frame);
      return;
    }

    try {
      const opened = await openFrame(this.aeadKey, frame);
      // Only accept host→client frames; reject our own direction reflected back.
      if (opened.dir !== DIR_HOST_TO_CLIENT) { this.close(); return; }
      if (parseHostNonce(opened.plaintext) !== null) {
        // An hn frame after the handshake already settled means the host and
        // client disagree on the key (e.g. the host switched to K1 only after
        // our fallback timer had already committed us to K0) - unrecoverable;
        // close so the caller rebuilds a fresh connection instead of every
        // later send silently failing against a host that dropped to K1.
        this.close();
        return;
      }
      this.onmessage?.(new MessageEvent('message', { data: opened.plaintext }));
    } catch {
      // Tag-verify failure ⇒ forged/tampered frame ⇒ drop it and close the
      // channel per the crypto contract.
      this.close();
    }
  }

  /** Seal {"c":"hello2"} under K0 as the first frame and arm the fallback timeout. */
  private async beginRekey(): Promise<void> {
    if (!this.aeadKey || !this.ws) { this.close(); return; }
    let helloFrame: Uint8Array;
    try {
      // Consumes sendCounter's 0 so a legacy K0 fallback's first real send
      // (which does NOT reset the counter) never reuses it under the same key.
      helloFrame = await seal(this.aeadKey, DIR_CLIENT_TO_HOST, this.sendCounter++, REKEY_HELLO2);
    } catch {
      this.close();
      return;
    }
    if (this.readyState === RelayChannel.CLOSED || !this.ws) return;
    try {
      const out = new ArrayBuffer(helloFrame.byteLength);
      new Uint8Array(out).set(helloFrame);
      this.ws.send(out);
    } catch {
      this.close();
      return;
    }
    this.rekeyTimer = setTimeout(() => {
      // No host frame at all within the window ⇒ legacy host; fall back to K0.
      if (!this.rekeyDone) this.finishRekey(null);
    }, REKEY_TIMEOUT_MS);
  }

  /** The first BINARY frame after hello2: either the v2 host's hn reply, or a legacy host's first real frame. */
  private async handleRekeyFrame(frame: Uint8Array): Promise<void> {
    clearTimeout(this.rekeyTimer);
    if (!this.aeadKey) { this.close(); return; }
    let opened;
    try {
      opened = await openFrame(this.aeadKey, frame);
    } catch {
      // Tag-verify failure is a channel error, not a legacy-fallback signal.
      this.close();
      return;
    }
    if (opened.dir !== DIR_HOST_TO_CLIENT) { this.close(); return; }

    const hn = parseHostNonce(opened.plaintext);
    if (hn && this.relayRoot) {
      let k1: CryptoKey;
      try {
        k1 = await deriveRekeyedAeadKey(this.relayRoot, this.connSalt, base64UrlDecode(hn));
      } catch {
        this.close();
        return;
      }
      this.aeadKey = k1;
      this.sendCounter = 0;
      this.finishRekey(null);
      return;
    }

    // Legacy host: this frame is real multiplex data under K0, not an hn reply.
    this.finishRekey(opened.plaintext);
  }

  /** Resolve the rekey handshake: go OPEN, optionally deliver a legacy-fallback frame's plaintext first. */
  private finishRekey(pendingPlaintext: string | null): void {
    if (this.rekeyDone || this.readyState === RelayChannel.CLOSED) return;
    clearTimeout(this.rekeyTimer);
    this.rekeyDone = true;
    this.readyState = RelayChannel.OPEN;
    this.onopen?.(new Event('open'));
    if (pendingPlaintext !== null) {
      this.onmessage?.(new MessageEvent('message', { data: pendingPlaintext }));
    }
  }

  /** Seal a multiplex TEXT frame and send it as BINARY to the relay. */
  send(text: string): void {
    if (this.readyState !== RelayChannel.OPEN || !this.aeadKey || !this.ws) return;
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
    clearTimeout(this.rekeyTimer);
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

/**
 * A failed relay claim. `error` is the host's code: 'denied' and 'expired'
 * end a host approval, 'cancelled' is the local abort, anything else is the
 * host's refusal text (expired token, remote-disabled, code-in-use, ...).
 */
export interface RelayClaimErr {
  ok: false;
  error: string;
}

export type RelayClaimResult = RelayClaimOk | RelayClaimErr;

/** The host parked the claim on its Allow prompt; show the SAS and wait. */
export interface RelayClaimPending {
  requestId: string;
  sas: string;
  machineName?: string;
  spki?: string;
}

export interface PairOverRelayOptions {
  /** Called when the host asks for approval (once per request id). */
  onPending?: (pending: RelayClaimPending) => void;
  /** Aborting cancels a pending approval (approved:false is sent when the link is up). */
  signal?: AbortSignal;
  /** Delay between claim-confirm polls. */
  pollMs?: number;
}

/** Poll cadence for claim-confirm, matching the native apps and the LAN confirm poll. */
export const RELAY_CLAIM_POLL_MS = 1000;

/** Fallback approval lifetime when claim-pending carries no expiry; matches the host request TTL. */
export const RELAY_CLAIM_TTL_MS = 60_000;

// Wire shape of a sealed reply the PC sends back over the pair-rid relay link.
interface SealedClaimReply {
  type?: string;
  sessionToken?: string;
  machineName?: string;
  spki?: string;
  error?: string;
  requestId?: string;
  sas?: string;
  expiresAt?: number;
}

// Terminal host refusals of a parked approval.
const CLAIM_TERMINAL_APPROVAL_ERRORS = new Set(['denied', 'expired']);
// Refusals that leave the link and any parked request untouched: keep going.
const CLAIM_RETRYABLE_ERRORS = new Set(['unknown', 'update_required', 'claim-in-progress']);

// Why one relay connection ended without a final answer.
class RelayLinkDropped extends Error {}

/** The PC answered with a reply this client cannot act on (e.g. claim-pending without a SAS). */
export class RelayProtocolError extends Error {}

/**
 * Pair a brand-new phone over the cloud relay (internet pairing with host approval).
 *
 * Unlike RelayChannel (a long-lived runtime transport keyed off a SESSION
 * token), this is a request/response exchange keyed off the QR `pair` token:
 *   1. derive pairRoot from the pair token and rid_pair via deriveRid;
 *   2. per connection, pick a FRESH connSalt (the PC accepts each salt once per
 *      link, and the AES-GCM nonce is only dir||counter), derive the claim key
 *      via deriveAeadKey(pairRoot, connSalt), open the relay WSS and send the
 *      client hello;
 *   3. on peer-up send {"type":"claim","deviceName","deviceId",
 *      "supportsSasApproval":true} sealed dir=client->host at
 *      counter 0. Inbound counters must strictly increase per key, so every
 *      later frame on the same connection takes the next counter;
 *   4. reply handling:
 *        claim-ok       terminal, resolves with the session token (an older
 *                       host answers the first claim this way, no approval);
 *        claim-pending  the PC asks its user to Allow; surface the SAS through
 *                       onPending and poll {"type":"claim-confirm",requestId,
 *                       approved:true} about once a second;
 *        claim-waiting  keep polling;
 *        claim-err      denied/expired are terminal; unknown, update_required
 *                       and claim-in-progress keep polling; any other error
 *                       (code-in-use, pairing token expired, ...) is terminal.
 *   5. a link that drops after the claim went out reconnects with a new salt:
 *      with a parked request it resumes with claim-confirm from counter 0,
 *      otherwise it resends the claim. Both stop at the TTL deadline, which
 *      runs on the local clock from the claim (then from claim-pending).
 *
 * Rejects on a transport/handshake/crypto failure before the claim was sent so the caller can fall back (e.g. to a "generate a fresh QR" surface).
 */
export async function pairOverRelay(
  url: string,
  pairToken: string,
  deviceName: string,
  deviceId: string,
  options: PairOverRelayOptions = {},
): Promise<RelayClaimResult> {
  const { onPending, signal, pollMs = RELAY_CLAIM_POLL_MS } = options;
  const pairRoot = await derivePairRoot(pairToken);
  const ridPair = await deriveRid(pairRoot);

  // State that outlives one connection.
  let requestId: string | undefined;
  // Local-clock deadline, never the PC's absolute expiry: restarted from the
  // moment claim-pending is received, so clock skew cannot shorten or extend it.
  let deadline = Date.now() + RELAY_CLAIM_TTL_MS;
  // A claim frame reached the PC on some connection; a drop after that point
  // may have parked a request there, so it is retried instead of failed.
  let claimSent = false;
  let announced: string | undefined;

  for (;;) {
    if (signal?.aborted) return { ok: false, error: 'cancelled' };
    if (Date.now() >= deadline) return { ok: false, error: 'expired' };
    try {
      return await runClaimConnection();
    } catch (err) {
      // A lost link after the claim went out is resumable until the deadline
      // (the PC may already hold a parked request); a failure before any claim
      // reached it, a forged frame or a bad reply surfaces to the caller.
      if (!(err instanceof RelayLinkDropped)) throw err;
    }
    await sleep(pollMs, signal);
    if (Date.now() >= deadline) return { ok: false, error: 'expired' };
  }

  async function runClaimConnection(): Promise<RelayClaimResult> {
    // Fresh per connection: the PC accepts each salt once per link.
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
      // Next outbound counter and highest accepted reply counter on this key.
      let sendCounter = 0;
      let lastReplyCounter = -1;
      // A frame is in flight: the next one is only sent after its reply.
      let awaitingReply = false;
      // Once a BINARY reply arrived, the in-flight decrypt is the source of
      // truth: the PC closes the link right after a terminal reply, and on
      // WebKit that close can beat the async WebCrypto open() of the frame.
      let replyInFlight = false;
      let pollTimer: ReturnType<typeof setTimeout> | undefined;
      let replyTimer: ReturnType<typeof setTimeout> | undefined;
      const connectTimer = setTimeout(() => fail(new Error('relay pair timeout')), RELAY_PAIR_TIMEOUT_MS);

      const cleanup = () => {
        clearTimeout(connectTimer);
        clearTimeout(pollTimer);
        clearTimeout(replyTimer);
        signal?.removeEventListener('abort', onAbort);
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
      const abort = (err: Error) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(err);
      };
      const fail = (err: Error) => {
        if (replyInFlight) return;
        // With a parked request a lost link is resumable; otherwise it is a real failure.
        abort(requestId || claimSent ? new RelayLinkDropped(err.message) : err);
      };

      const sendSealed = async (payload: object): Promise<void> => {
        const frame = await seal(claimKey, DIR_CLIENT_TO_HOST, sendCounter++, JSON.stringify(payload));
        const out = new ArrayBuffer(frame.byteLength);
        new Uint8Array(out).set(frame);
        socket.send(out);
      };

      // The next request: poll the parked request, else (re)send the claim.
      const sendNext = async (): Promise<void> => {
        if (settled) return;
        if (Date.now() >= deadline) { succeed({ ok: false, error: 'expired' }); return; }
        awaitingReply = true;
        clearTimeout(replyTimer);
        replyTimer = setTimeout(() => fail(new Error('relay claim reply timeout')), RELAY_PAIR_TIMEOUT_MS);
        try {
          if (requestId) {
            await sendSealed({ type: 'claim-confirm', requestId, approved: true });
          } else {
            claimSent = true;
            await sendSealed({ type: 'claim', deviceName, deviceId, supportsSasApproval: true });
          }
        } catch {
          fail(new Error('claim seal/send failed'));
        }
      };
      const scheduleNext = () => {
        clearTimeout(pollTimer);
        pollTimer = setTimeout(() => { void sendNext(); }, pollMs);
      };

      // Cancel: tell the PC to drop the parked request when the link is up.
      const onAbort = () => {
        if (settled) return;
        if (requestId && peerUp && socket.readyState === 1) {
          void sendSealed({ type: 'claim-confirm', requestId, approved: false })
            .catch(() => { /* best effort */ })
            .finally(() => succeed({ ok: false, error: 'cancelled' }));
          return;
        }
        succeed({ ok: false, error: 'cancelled' });
      };
      signal?.addEventListener('abort', onAbort, { once: true });
      if (signal?.aborted) { onAbort(); return; }

      socket.onopen = () => {
        try {
          socket.send(JSON.stringify({ v: 1, role: 'client', rid: ridPair, salt: base64UrlNoPad(connSalt) }));
        } catch {
          fail(new Error('relay hello send failed'));
        }
      };
      socket.onmessage = (e) => { void handleMessage(e); };
      socket.onerror = () => fail(new Error('relay socket error'));
      socket.onclose = () => fail(new Error('relay closed before claim reply'));

      const handleReply = (reply: SealedClaimReply) => {
        awaitingReply = false;
        clearTimeout(replyTimer);
        switch (reply.type) {
          case 'claim-ok':
            if (reply.sessionToken) {
              succeed({ ok: true, sessionToken: reply.sessionToken, machineName: reply.machineName, spki: reply.spki });
            } else {
              abort(new Error('claim-ok without a session token'));
            }
            return;
          case 'claim-pending': {
            if (!reply.requestId || !reply.sas) { abort(new RelayProtocolError('claim-pending without a request id or sas')); return; }
            requestId = reply.requestId;
            deadline = Date.now() + RELAY_CLAIM_TTL_MS;
            if (announced !== requestId) {
              announced = requestId;
              onPending?.({
                requestId,
                sas: reply.sas,
                machineName: reply.machineName,
                spki: reply.spki,
              });
            }
            scheduleNext();
            return;
          }
          case 'claim-waiting':
            scheduleNext();
            return;
          case 'claim-err': {
            const error = reply.error || 'pair rejected';
            if (CLAIM_TERMINAL_APPROVAL_ERRORS.has(error)) { succeed({ ok: false, error }); return; }
            if (CLAIM_RETRYABLE_ERRORS.has(error)) {
              // Without a parked request there is nothing to poll: update_required
              // cannot resolve, the rest are a claim race that a resend can clear.
              if (!requestId && error === 'update_required') { succeed({ ok: false, error }); return; }
              scheduleNext();
              return;
            }
            succeed({ ok: false, error });
            return;
          }
          default:
            abort(new Error('unexpected claim reply'));
        }
      };

      const handleMessage = async (e: MessageEvent): Promise<void> => {
        if (settled) return;
        if (!peerUp) {
          // Pre-peer-up: the only expected message is the relay's TEXT control
          // frame. {"e":"peer-up"} means the PC's pair-rid host link is present.
          if (typeof e.data !== 'string') { fail(new Error('unexpected binary before peer-up')); return; }
          let ctrl: { e?: string };
          try { ctrl = JSON.parse(e.data) as { e?: string }; } catch { fail(new Error('bad relay control frame')); return; }
          if (ctrl.e !== 'peer-up') { fail(new Error(`relay control: ${ctrl.e ?? 'unknown'}`)); return; }
          peerUp = true;
          clearTimeout(connectTimer);
          await sendNext();
          return;
        }

        // After peer-up: TEXT is a relay control frame (peer-down); BINARY is a sealed reply.
        if (typeof e.data === 'string') {
          fail(new Error('relay peer-down before claim reply'));
          return;
        }
        const frameBytes = e.data instanceof ArrayBuffer ? new Uint8Array(e.data) : null;
        if (!frameBytes) { fail(new Error('malformed relay frame')); return; }
        if (!awaitingReply) return; // unsolicited frame
        replyInFlight = true;
        let opened;
        try {
          opened = await openFrame(claimKey, frameBytes);
        } catch {
          // Tag-verify failure: forged or tampered reply. A real failure, not the close race.
          abort(new Error('claim reply tag verify failed'));
          return;
        }
        if (opened.dir !== DIR_HOST_TO_CLIENT) { abort(new Error('claim reply wrong direction')); return; }
        // Host reply counters run 0, 1, 2 ... per key; a replayed or stale one is dropped.
        if (opened.counter <= lastReplyCounter) { replyInFlight = false; return; }
        lastReplyCounter = opened.counter;
        let reply: SealedClaimReply;
        try { reply = JSON.parse(opened.plaintext) as SealedClaimReply; } catch { abort(new Error('claim reply not JSON')); return; }
        replyInFlight = false;
        handleReply(reply);
      };
    });
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>(resolve => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => { clearTimeout(timer); resolve(); }, { once: true });
  });
}
