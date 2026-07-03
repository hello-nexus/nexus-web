// Shared id-multiplexed HTTP-tunnel wire framing + pending-request bookkeeping,
// used by both RelayHttpTunnel (relayHttp.ts, over the relay WS) and
// RtcHttpTunnel (rtcDirect.ts, over the WebRTC "http" data channel). Only the
// transport differs (relay wire handshake + AEAD framing vs an already-open
// sealed data channel); the request/response JSON shape and id-matching are
// identical between the two.
//
//   request:  {"id":N,"method":"GET|POST|PUT|DELETE|PATCH","path":"/panel/…",
//              "body":<string|null>,"contentType":<string|null>}
//   response: {"id":N,"status":N,"body":"<string>","contentType":<string|null>,
//              "base64":<bool>}  // base64=true ⇒ body is base64 bytes (binary-safe)

export type RelayHttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

/** A fetch-like result: status + the parsed/raw body. */
export interface RelayResponse {
  status: number;
  body: string;
  contentType: string | null;
  /** True when `body` is base64-encoded bytes (binary response) vs raw text. */
  base64: boolean;
}

export interface HttpTunnelRequestWire {
  id: number;
  method: RelayHttpMethod;
  path: string;
  body: string | null;
  contentType: string | null;
}

// Wire shape of a sealed response frame from the host (dir=1).
export interface HttpTunnelResponseWire {
  id?: number;
  status?: number;
  body?: string;
  contentType?: string | null;
  base64?: boolean;
}

export function buildRequestWire(
  id: number,
  method: RelayHttpMethod,
  path: string,
  body: string | null,
  contentType: string | null,
): HttpTunnelRequestWire {
  return { id, method, path, body, contentType };
}

interface PendingRequest {
  resolve: (r: RelayResponse) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * Monotonic-id pending-request map shared by every HTTP-tunnel transport: hands
 * out ids, matches a sealed response back to its resolver, and rejects
 * everything in-flight when the transport dies.
 */
export class PendingRequestTracker {
  private readonly pending = new Map<number, PendingRequest>();
  private idCounter = 0;

  nextId(): number {
    return ++this.idCounter;
  }

  register(id: number, resolve: (r: RelayResponse) => void, reject: (e: Error) => void, timer: ReturnType<typeof setTimeout>): void {
    this.pending.set(id, { resolve, reject, timer });
  }

  /** Remove a registered id without settling it (caller settles/rejects directly). Returns whether it was still pending. */
  drop(id: number): boolean {
    const entry = this.pending.get(id);
    if (!entry) return false;
    this.pending.delete(id);
    clearTimeout(entry.timer);
    return true;
  }

  /** Match a sealed response to its pending request and resolve it; a no-op for an unknown/already-settled id. */
  resolve(wire: HttpTunnelResponseWire): void {
    if (typeof wire.id !== 'number') return;
    const entry = this.pending.get(wire.id);
    if (!entry) return;
    this.pending.delete(wire.id);
    clearTimeout(entry.timer);
    entry.resolve({
      status: typeof wire.status === 'number' ? wire.status : 0,
      body: typeof wire.body === 'string' ? wire.body : '',
      contentType: wire.contentType ?? null,
      base64: wire.base64 === true,
    });
  }

  /** Reject every in-flight request (the transport died). */
  rejectAll(err: Error): void {
    for (const [, entry] of this.pending) {
      clearTimeout(entry.timer);
      entry.reject(err);
    }
    this.pending.clear();
  }
}
