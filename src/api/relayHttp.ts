// REST-over-relay tunnel (Phase 2). When the panel is connected to the PC over
// the cloud relay (not the LAN), the runtime `/ws` multiplex stream tunnels via
// RelayChannel - but the panel's REST calls (device list, layout, controls)
// still hit the PC's local HTTP and fail off-LAN. This module tunnels those
// HTTP calls over a SECOND relay channel (rid_http) so the off-LAN panel is
// fully usable. The proven `/ws` runtime channel is untouched.
//
// Channel: ONE lazily-opened relay WS (client role) keyed off the stored
// session token - rid_http = deriveHttpRid(relayRoot), fresh connSalt + aeadKey
// per connection. Reuses the exact relay wire protocol (client hello → peer-up
// → BINARY frames) + seal/open crypto as RelayChannel; the only difference is
// the payload framing: id-multiplexed request/response instead of the `{t,d}`
// stream.
//
// Tunnel protocol (sealed frames over rid_http; dir client→PC = 2, PC→client = 1):
//   request:  {"id":N,"method":"GET|POST|PUT|DELETE|PATCH","path":"/panel/…",
//              "body":<string|null>,"contentType":<string|null>}
//   response: {"id":N,"status":N,"body":"<string>","contentType":<string|null>,
//              "base64":<bool>}  // base64=true ⇒ body is base64 bytes (binary-safe)
// Requests multiplex by a monotonic id; responses match back by that id. The
// PC dispatches each request authorized as this relay session's phone session
// (the tunnel is already authenticated server-side), so NO bearer is sent.

import {
  DIR_CLIENT_TO_HOST,
  DIR_HOST_TO_CLIENT,
  base64UrlNoPad,
  deriveAeadKey,
  deriveHttpRid,
  deriveRelayRoot,
  open as openFrame,
  seal,
} from './relayCrypto';

// How long to wait for the relay's peer-up after the client hello before
// treating the tunnel open as failed. Matches the runtime RelayChannel timeout:
// if the host isn't holding its rid_http link there's nothing to wait for.
const PEER_UP_TIMEOUT_MS = 6000;

// How long to wait for a sealed response to a sealed request before giving up
// on that single request (the tunnel stays open for other ids). Generous: the
// PC has to dispatch through its real route pipeline before answering.
const REQUEST_TIMEOUT_MS = 20000;

/** A fetch-like result returned by relayFetch - status + the parsed/raw body. */
export interface RelayResponse {
  status: number;
  body: string;
  contentType: string | null;
  /** True when `body` is base64-encoded bytes (binary response) vs raw text. */
  base64: boolean;
}

export type RelayHttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

// Wire shape of a sealed response frame from the PC (dir=1).
interface SealedHttpResponse {
  id?: number;
  status?: number;
  body?: string;
  contentType?: string | null;
  base64?: boolean;
}

interface PendingRequest {
  resolve: (r: RelayResponse) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * One relay HTTP-tunnel connection: a single relay WS (client role, rid_http)
 * that seals request frames and matches sealed responses by id. Concurrent
 * requests multiplex over the one socket. On any close/error the tunnel rejects
 * all in-flight requests and marks itself dead so the owner drops it and the
 * next relayFetch opens a fresh one.
 */
class RelayHttpTunnel {
  private ws: WebSocket | null = null;
  private aeadKey: CryptoKey | null = null;
  private sendCounter = 0;
  private peerUp = false;
  private dead = false;
  private peerUpTimer: ReturnType<typeof setTimeout> | undefined;
  // Resolves once the relay reports peer-up (the host's rid_http link is up);
  // rejects if the open fails / times out. Awaited before sealing any request.
  private readonly ready: Promise<void>;
  private readyResolve!: () => void;
  private readyReject!: (e: Error) => void;
  private readonly pending = new Map<number, PendingRequest>();
  // connSalt is fresh per connection ⇒ a fresh aeadKey ⇒ the (dir,counter)
  // nonce space never repeats across connections.
  private readonly connSalt: Uint8Array;
  // Notifies the owning module when this tunnel dies so it can drop the cached
  // reference and lazily build a new one on the next relayFetch.
  private readonly onDead: () => void;
  private readonly url: string;
  private readonly token: string;

  constructor(url: string, token: string, onDead: () => void) {
    this.url = url;
    this.token = token;
    this.onDead = onDead;
    this.connSalt = crypto.getRandomValues(new Uint8Array(16));
    this.ready = new Promise<void>((resolve, reject) => {
      this.readyResolve = resolve;
      this.readyReject = reject;
    });
    void this.connect();
  }

  /** Begin connecting: derive keys, open the relay WSS, send the client hello. */
  private async connect(): Promise<void> {
    let rid: string;
    try {
      const relayRoot = await deriveRelayRoot(this.token);
      rid = await deriveHttpRid(relayRoot);
      this.aeadKey = await deriveAeadKey(relayRoot, this.connSalt);
    } catch {
      this.die(new Error('relay http: key derivation failed'));
      return;
    }
    if (this.dead) return; // closed during derivation

    let socket: WebSocket;
    try {
      socket = new WebSocket(this.url);
    } catch {
      this.die(new Error('relay http: socket open failed'));
      return;
    }
    socket.binaryType = 'arraybuffer';
    this.ws = socket;

    socket.onopen = () => {
      // nh:1 opts into the relay's {"e":"no-host"} advisory so the tunnel (which
      // backs the /ping that drives the offline overlay) fails fast when the PC
      // isn't on the relay, instead of waiting out the peer-up timeout.
      const hello = JSON.stringify({ v: 1, role: 'client', rid, salt: base64UrlNoPad(this.connSalt), nh: 1 });
      try {
        socket.send(hello);
      } catch {
        this.die(new Error('relay http: hello send failed'));
        return;
      }
      this.peerUpTimer = setTimeout(() => {
        if (!this.peerUp) this.die(new Error('relay http: peer-up timeout'));
      }, PEER_UP_TIMEOUT_MS);
    };

    socket.onmessage = (e) => { void this.handleMessage(e); };

    socket.onclose = () => this.die(new Error('relay http: channel closed'));

    socket.onerror = () => {
      // An errored socket is a failed connection; close it so onclose drives
      // the teardown (mirrors RelayChannel's onerror→close).
      try { socket.close(); } catch { /* already closing */ }
    };
  }

  private async handleMessage(e: MessageEvent): Promise<void> {
    if (!this.peerUp) {
      // Pre-peer-up: the only expected message is the relay's TEXT control
      // frame. {"e":"peer-up"} promotes the tunnel to usable; anything else
      // (peer-down, no host) ends it.
      if (typeof e.data !== 'string') { this.die(new Error('relay http: binary before peer-up')); return; }
      let parsed: { e?: string };
      try { parsed = JSON.parse(e.data) as { e?: string }; } catch { this.die(new Error('relay http: bad control frame')); return; }
      if (parsed.e === 'peer-up') {
        clearTimeout(this.peerUpTimer);
        this.peerUp = true;
        this.readyResolve();
      } else {
        this.die(new Error(`relay http: control ${parsed.e ?? 'unknown'}`));
      }
      return;
    }

    // After peer-up: TEXT is a relay control frame (peer-down); BINARY is an
    // encrypted host→client sealed response.
    if (typeof e.data === 'string') {
      let parsed: { e?: string };
      try { parsed = JSON.parse(e.data) as { e?: string }; } catch { return; }
      if (parsed.e === 'peer-down') this.die(new Error('relay http: peer-down'));
      return;
    }

    if (!this.aeadKey) return;
    const frame = e.data instanceof ArrayBuffer ? new Uint8Array(e.data) : null;
    if (!frame) return;
    let opened;
    try {
      opened = await openFrame(this.aeadKey, frame);
    } catch {
      // Tag-verify failure ⇒ forged/tampered frame ⇒ tear the channel down per
      // the crypto contract.
      this.die(new Error('relay http: tag verify failed'));
      return;
    }
    if (opened.dir !== DIR_HOST_TO_CLIENT) { this.die(new Error('relay http: wrong direction')); return; }

    let resp: SealedHttpResponse;
    try { resp = JSON.parse(opened.plaintext) as SealedHttpResponse; } catch { return; }
    if (typeof resp.id !== 'number') return;
    const entry = this.pending.get(resp.id);
    if (!entry) return; // unknown / already-settled id
    this.pending.delete(resp.id);
    clearTimeout(entry.timer);
    entry.resolve({
      status: typeof resp.status === 'number' ? resp.status : 0,
      body: typeof resp.body === 'string' ? resp.body : '',
      contentType: resp.contentType ?? null,
      base64: resp.base64 === true,
    });
  }

  /** Seal an HTTP request frame and await the sealed response matched by id. */
  async request(method: RelayHttpMethod, path: string, body: string | null, contentType: string | null): Promise<RelayResponse> {
    await this.ready; // throws if the tunnel failed to open
    if (this.dead || !this.aeadKey || !this.ws) throw new Error('relay http: tunnel not open');
    const id = this.nextId();
    const payload = JSON.stringify({ id, method, path, body, contentType });
    const counter = this.sendCounter++;
    const frame = await seal(this.aeadKey, DIR_CLIENT_TO_HOST, counter, payload);
    if (this.dead || !this.ws) throw new Error('relay http: tunnel closed before send');

    return new Promise<RelayResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pending.delete(id)) reject(new Error('relay http: request timeout'));
      }, REQUEST_TIMEOUT_MS);
      this.pending.set(id, { resolve, reject, timer });
      try {
        // Copy into a standalone ArrayBuffer for the WS send (seal() returns a
        // fresh tightly-packed Uint8Array, so its buffer is exactly the frame).
        const out = new ArrayBuffer(frame.byteLength);
        new Uint8Array(out).set(frame);
        this.ws!.send(out);
      } catch {
        this.pending.delete(id);
        clearTimeout(timer);
        reject(new Error('relay http: request send failed'));
      }
    });
  }

  // Monotonic per-tunnel request id. A control-only tunnel never approaches
  // Number.MAX_SAFE_INTEGER, so a plain counter is enough.
  private idCounter = 0;
  private nextId(): number {
    return ++this.idCounter;
  }

  /** Tear the tunnel down: reject all in-flight requests, close the socket. */
  private die(err: Error): void {
    if (this.dead) return;
    this.dead = true;
    clearTimeout(this.peerUpTimer);
    // Reject the ready gate (a no-op if it already resolved at peer-up).
    this.readyReject(err);
    for (const [, entry] of this.pending) {
      clearTimeout(entry.timer);
      entry.reject(err);
    }
    this.pending.clear();
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onerror = null;
      this.ws.onclose = null;
      try { this.ws.close(); } catch { /* already closing */ }
      this.ws = null;
    }
    this.onDead();
  }
}

// Lazily-created shared tunnel. ONE rid_http channel is reused across all
// concurrent relay fetches; it self-heals by dropping itself on close/error so
// the next relayFetch opens a fresh connection.
let tunnel: RelayHttpTunnel | null = null;

/**
 * Send an HTTP request over the relay HTTP tunnel and resolve a fetch-like
 * result. Lazily opens the single rid_http channel (deriving rid_http +
 * aeadKey from `token`), seals the request (dir=2), and awaits the sealed
 * response (dir=1) matched by id. On a transport failure (close, error, the
 * relay duplicate-rid close, timeout) the tunnel rejects and drops itself, so
 * the next call rebuilds it. Callers (the service.ts fetch layer) treat a throw
 * the same as a failed window.fetch.
 */
export async function relayFetch(
  token: string,
  url: string,
  method: RelayHttpMethod,
  path: string,
  body: string | null = null,
  contentType: string | null = null,
): Promise<RelayResponse> {
  if (!tunnel) {
    tunnel = new RelayHttpTunnel(url, token, () => { tunnel = null; });
  }
  return tunnel.request(method, path, body, contentType);
}

/** Drop the cached tunnel (e.g. when the relay transport goes away). */
export function resetRelayHttpTunnel(): void {
  tunnel = null;
}
