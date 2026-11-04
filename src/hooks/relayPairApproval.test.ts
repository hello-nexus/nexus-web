import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DIR_CLIENT_TO_HOST,
  DIR_HOST_TO_CLIENT,
  deriveAeadKey,
  derivePairRoot,
  open as openFrame,
  seal,
} from '../api/relayCrypto';
import { pairOverRelay, type RelayClaimPending } from './relayChannel';

// Scripted PC host behind a mock relay socket. Each request (opened under the
// pair-derived key) is handed to `script`, whose return value is sealed back at
// the host's per-key reply counter. Records inbound counters and salts so the
// counter and fresh-salt rules can be asserted.

const PAIR_TOKEN = 'PAIRTOK-approval-0123456789';
const POLL = 5;

type Req = { type: string; requestId?: string; approved?: boolean; deviceName?: string; supportsSasApproval?: boolean; sessionToken?: string };
type Script = (req: Req, socket: HostSocket) => object | null;

let script: Script = () => null;
let sockets: HostSocket[] = [];
// When set, a new socket's open fails (relay unreachable).
let failOpen = false;

function b64urlToBytes(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}

class HostSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  readyState = 0;
  binaryType = 'arraybuffer';
  onopen: ((e: Event) => void) | null = null;
  onmessage: ((e: MessageEvent) => void) | null = null;
  onclose: ((e: CloseEvent) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
  salt = '';
  inbound: number[] = [];
  requests: Req[] = [];
  nextReply = 0;
  closed = false;
  constructor(public url: string) {
    sockets.push(this);
    setTimeout(() => {
      if (failOpen) { this.onerror?.(new Event('error')); return; }
      this.readyState = 1;
      this.onopen?.(new Event('open'));
    }, 0);
  }
  send(data: string | ArrayBuffer): void {
    if (typeof data === 'string') {
      this.salt = (JSON.parse(data) as { salt: string }).salt;
      setTimeout(() => this.onmessage?.(new MessageEvent('message', { data: JSON.stringify({ e: 'peer-up' }) })), 0);
      return;
    }
    void this.handle(new Uint8Array(data));
  }
  private async handle(frame: Uint8Array): Promise<void> {
    const key = await deriveAeadKey(await derivePairRoot(PAIR_TOKEN), b64urlToBytes(this.salt));
    const opened = await openFrame(key, frame);
    expect(opened.dir).toBe(DIR_CLIENT_TO_HOST);
    this.inbound.push(opened.counter);
    const req = JSON.parse(opened.plaintext) as Req;
    this.requests.push(req);
    const reply = script(req, this);
    if (!reply) return;
    await this.reply(key, reply);
  }
  async reply(key: CryptoKey, reply: object, counter = this.nextReply++): Promise<void> {
    const out = await seal(key, DIR_HOST_TO_CLIENT, counter, JSON.stringify(reply));
    const buf = new ArrayBuffer(out.byteLength);
    new Uint8Array(buf).set(out);
    this.onmessage?.(new MessageEvent('message', { data: buf }));
  }
  drop(): void { this.onclose?.(new CloseEvent('close')); }
  close(): void { this.closed = true; this.readyState = 3; }
}

const pending = (over: object = {}) => ({
  type: 'claim-pending', requestId: 'req-1', sas: '123 456', expiresAt: Date.now() + 60_000, machineName: 'PC', spki: 'AA', ...over,
});
const ok = { type: 'claim-ok', sessionToken: 'SESS-1', machineName: 'PC', spki: 'AA' };

function run(opts: Parameters<typeof pairOverRelay>[4] = {}) {
  return pairOverRelay('wss://relay.test/relay', PAIR_TOKEN, 'iPhone', 'dev-1', { pollMs: POLL, ...opts });
}

beforeEach(() => {
  sockets = [];
  failOpen = false;
  script = () => null;
  vi.stubGlobal('WebSocket', HostSocket as unknown as typeof WebSocket);
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('pairOverRelay host approval', () => {
  it('claim sends the SAS flag, shows pending, polls through waiting, then claim-ok', async () => {
    let polls = 0;
    script = (req) => {
      if (req.type === 'claim') return pending();
      polls++;
      return polls < 3 ? { type: 'claim-waiting' } : ok;
    };
    const seen: RelayClaimPending[] = [];
    const result = await run({ onPending: p => seen.push(p) });
    expect(result).toEqual({ ok: true, sessionToken: 'SESS-1', machineName: 'PC', spki: 'AA' });
    expect(seen).toHaveLength(1);
    expect(seen[0].sas).toBe('123 456');
    expect(seen[0].machineName).toBe('PC');
    const [s] = sockets;
    expect(s.requests[0]).toMatchObject({ type: 'claim', deviceName: 'iPhone', supportsSasApproval: true });
    expect(s.requests[0]).not.toHaveProperty('sessionToken');
    expect(s.requests.slice(1).every(r => r.type === 'claim-confirm' && r.requestId === 'req-1' && r.approved === true)).toBe(true);
    expect(s.closed).toBe(true);
  });

  it('inbound counters strictly increase per key: 0 for the claim, then 1, 2, ...', async () => {
    let polls = 0;
    script = (req) => (req.type === 'claim' ? pending() : ++polls < 4 ? { type: 'claim-waiting' } : ok);
    await run();
    expect(sockets[0].inbound).toEqual([0, 1, 2, 3, 4]);
  });

  it('includes the session token when the browser holds one', async () => {
    script = () => ok;
    await run({ sessionToken: 'LIVE' });
    expect(sockets[0].requests[0].sessionToken).toBe('LIVE');
  });

  it('old service: claim-ok straight to the first claim, no polling', async () => {
    script = () => ok;
    const onPending = vi.fn();
    const result = await run({ onPending });
    expect(result).toEqual({ ok: true, sessionToken: 'SESS-1', machineName: 'PC', spki: 'AA' });
    expect(onPending).not.toHaveBeenCalled();
    expect(sockets[0].requests).toHaveLength(1);
  });

  it.each(['denied', 'expired'])('%s is terminal', async (error) => {
    script = (req) => (req.type === 'claim' ? pending() : { type: 'claim-err', error });
    expect(await run()).toEqual({ ok: false, error });
    expect(sockets).toHaveLength(1);
  });

  it('code-in-use and other refusals are terminal', async () => {
    script = () => ({ type: 'claim-err', error: 'code-in-use' });
    expect(await run()).toEqual({ ok: false, error: 'code-in-use' });
  });

  it('update_required on the first claim (nothing parked) is terminal', async () => {
    script = () => ({ type: 'claim-err', error: 'update_required' });
    expect(await run()).toEqual({ ok: false, error: 'update_required' });
    expect(sockets[0].requests).toHaveLength(1);
  });

  it.each(['claim-in-progress', 'unknown', 'update_required'])('%s keeps polling the parked request', async (error) => {
    let polls = 0;
    script = (req) => {
      if (req.type === 'claim') return pending();
      return ++polls === 1 ? { type: 'claim-err', error } : ok;
    };
    const result = await run();
    expect(result.ok).toBe(true);
    expect(sockets[0].requests.map(r => r.type)).toEqual(['claim', 'claim-confirm', 'claim-confirm']);
    expect(sockets[0].requests[2].requestId).toBe('req-1');
  });

  it('claim-in-progress before any request resends the claim at the next counter', async () => {
    let n = 0;
    script = () => (++n === 1 ? { type: 'claim-err', error: 'claim-in-progress' } : ok);
    const result = await run();
    expect(result.ok).toBe(true);
    expect(sockets[0].requests.map(r => r.type)).toEqual(['claim', 'claim']);
    expect(sockets[0].inbound).toEqual([0, 1]);
  });

  it('a dropped link resumes on a fresh salt with claim-confirm at counter 0', async () => {
    let first = true;
    script = (req, sock) => {
      if (req.type === 'claim') {
        // Park, then lose the link right after the pending reply is delivered.
        setTimeout(() => sock.drop(), 40);
        return pending();
      }
      first = false;
      return ok;
    };
    const result = await run({ pollMs: 200 });
    expect(result.ok).toBe(true);
    expect(first).toBe(false);
    expect(sockets).toHaveLength(2);
    expect(sockets[1].salt).not.toBe(sockets[0].salt);
    expect(sockets[1].inbound[0]).toBe(0);
    expect(sockets[1].requests[0]).toEqual({ type: 'claim-confirm', requestId: 'req-1', approved: true });
  });

  it('a replayed host reply counter is ignored', async () => {
    let polls = 0;
    script = (req, sock) => {
      if (req.type === 'claim') {
        setTimeout(() => {
          void (async () => {
            const key = await deriveAeadKey(await derivePairRoot(PAIR_TOKEN), b64urlToBytes(sock.salt));
            // Counter 0 was already used by the pending reply: a replayed claim-ok must not settle the claim.
            await sock.reply(key, ok, 0);
          })();
        }, 12);
        return pending();
      }
      return ++polls < 8 ? { type: 'claim-waiting' } : ok;
    };
    const result = await run();
    expect(result.ok).toBe(true);
    // Polling continued past the injected frame; only the real claim-ok ended it.
    expect(sockets[0].requests.filter(r => r.type === 'claim-confirm')).toHaveLength(8);
  });

  it('cancel sends approved:false and resolves cancelled', async () => {
    const abort = new AbortController();
    script = (req) => {
      if (req.type === 'claim') { setTimeout(() => abort.abort(), 1); return pending(); }
      return req.approved === false ? null : { type: 'claim-waiting' };
    };
    const result = await run({ signal: abort.signal });
    expect(result).toEqual({ ok: false, error: 'cancelled' });
    await vi.waitFor(() => expect(sockets[0].requests.at(-1)).toEqual({ type: 'claim-confirm', requestId: 'req-1', approved: false }));
  });

  it('rejects when the relay never connects before any request is parked', async () => {
    failOpen = true;
    await expect(run()).rejects.toThrow();
  });
});
