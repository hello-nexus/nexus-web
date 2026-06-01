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
      const hello = JSON.stringify({ v: 1, role: 'client', rid, salt: base64UrlNoPad(this.connSalt) });
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
      // frame. {"e":"peer-up"} promotes us to OPEN; anything else (peer-down,
      // unexpected) ends the channel.
      if (typeof e.data !== 'string') { this.close(); return; }
      let parsed: { e?: string };
      try { parsed = JSON.parse(e.data) as { e?: string }; } catch { this.close(); return; }
      if (parsed.e === 'peer-up') {
        clearTimeout(this.peerUpTimer);
        this.peerUp = true;
        this.readyState = RelayChannel.OPEN;
        this.onopen?.(new Event('open'));
      } else {
        // peer-down before peer-up, or an unknown control frame.
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
