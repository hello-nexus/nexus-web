import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DIR_CLIENT_TO_HOST,
  DIR_HOST_TO_CLIENT,
  deriveAeadKey,
  derivePairRoot,
  deriveRid,
  open as openFrame,
  seal,
} from './relayCrypto';

// ---------------------------------------------------------------------------
// Mock relay: a tiny in-process stand-in for api.hellonexus.com/relay that ALSO
// plays the PC host side. On client hello it emits peer-up, then opens the
// phone's sealed claim under the SAME pair-derived key the PC would use,
// asserts the rid_pair matches the QR token, and seals back a claim-ok (or
// claim-err / nothing, to exercise the failure branches). This proves the
// browser pair-over-relay handshake end-to-end without a real socket.
// ---------------------------------------------------------------------------

type RelayBehavior = 'claim-ok' | 'claim-err' | 'no-peer-up' | 'open-error';

interface RelayCapture {
  rid: string;
  salt: string;
  deviceName: string;
}

const PAIR_TOKEN = 'PAIRTOK-abcdef0123456789';
const RID_PAIR = '0BwEM0g8zmt-2llFkxrdrw';

let behavior: RelayBehavior = 'claim-ok';
let captured: RelayCapture | null = null;
let relaySockets: MockRelaySocket[] = [];

function b64urlToBytes(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

class MockRelaySocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState = MockRelaySocket.CONNECTING;
  binaryType = 'arraybuffer';
  onopen: ((e: Event) => void) | null = null;
  onmessage: ((e: MessageEvent) => void) | null = null;
  onclose: ((e: CloseEvent) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;

  constructor(public url: string) {
    relaySockets.push(this);
    if (behavior === 'open-error') {
      setTimeout(() => {
        this.onerror?.(new Event('error'));
      }, 0);
      return;
    }
    setTimeout(() => {
      this.readyState = MockRelaySocket.OPEN;
      this.onopen?.(new Event('open'));
    }, 0);
  }

  send(data: string | ArrayBuffer): void {
    if (typeof data === 'string') {
      // Client hello: capture rid + salt, then play the host side.
      const hello = JSON.parse(data) as { rid: string; salt: string };
      captured = { rid: hello.rid, salt: hello.salt, deviceName: '' };
      if (behavior === 'no-peer-up') return; // host never shows up
      // Emit peer-up to the client.
      setTimeout(() => {
        this.onmessage?.(new MessageEvent('message', { data: JSON.stringify({ e: 'peer-up' }) }));
      }, 0);
      return;
    }
    // Sealed claim frame from the phone. Decrypt it as the PC would and reply.
    void this.handleClaim(new Uint8Array(data));
  }

  private async handleClaim(frame: Uint8Array): Promise<void> {
    const pairRoot = await derivePairRoot(PAIR_TOKEN);
    const connSalt = b64urlToBytes(captured!.salt);
    const key = await deriveAeadKey(pairRoot, connSalt);
    const opened = await openFrame(key, frame);
    expect(opened.dir).toBe(DIR_CLIENT_TO_HOST);
    const claim = JSON.parse(opened.plaintext) as { type: string; deviceName: string };
    expect(claim.type).toBe('claim');
    captured!.deviceName = claim.deviceName;

    const reply = behavior === 'claim-err'
      ? JSON.stringify({ type: 'claim-err', error: 'pair token expired' })
      : JSON.stringify({ type: 'claim-ok', sessionToken: 'SESS-relay-9999', machineName: 'NICOLA-PC', spki: 'AB:CD' });
    const replyFrame = await seal(key, DIR_HOST_TO_CLIENT, 0, reply);
    const out = new ArrayBuffer(replyFrame.byteLength);
    new Uint8Array(out).set(replyFrame);
    this.onmessage?.(new MessageEvent('message', { data: out }));
  }

  close(): void {
    this.readyState = MockRelaySocket.CLOSED;
  }
}

// LAN claim mock: drives the host-reachable / host-refused / unreachable cases.
const lanClaimMock = vi.fn();
const storePhoneTokenMock = vi.fn();

vi.mock('./panel', () => ({
  claimPanelPhonePairingLan: (...args: unknown[]) => lanClaimMock(...args),
}));

vi.mock('./auth', () => ({
  storePhoneToken: (...args: unknown[]) => storePhoneTokenMock(...args),
}));

// Pin the relay URL so the test doesn't depend on env.
vi.mock('./service', () => ({
  resolveRelayWs: () => 'wss://relay.test/relay',
}));

import { pairOverInternet, LAN_CLAIM_TIMEOUT_MS } from './internetPairing';

beforeEach(() => {
  behavior = 'claim-ok';
  captured = null;
  relaySockets = [];
  lanClaimMock.mockReset();
  storePhoneTokenMock.mockReset();
  vi.stubGlobal('WebSocket', MockRelaySocket as unknown as typeof WebSocket);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('pairOverInternet — LAN-first decision', () => {
  it('takes the LAN fast path when the LAN claim succeeds (no relay dialed)', async () => {
    lanClaimMock.mockResolvedValueOnce({ paired: true, token: 'LAN-TOKEN', machineName: 'PC' });

    const result = await pairOverInternet({
      host: '192.168.1.50', httpPort: '9400', pairToken: PAIR_TOKEN, deviceName: 'iPhone',
    });

    expect(result).toEqual({ kind: 'lan', token: 'LAN-TOKEN', machineName: 'PC' });
    // Relay must NOT have been opened on the LAN fast path.
    expect(relaySockets).toHaveLength(0);
    expect(storePhoneTokenMock).not.toHaveBeenCalled();
  });

  it('passes the LAN claim an abort signal (short timeout)', async () => {
    lanClaimMock.mockResolvedValueOnce({ paired: true, token: 'LAN-TOKEN' });
    await pairOverInternet({ host: 'h', httpPort: '9400', pairToken: PAIR_TOKEN, deviceName: 'iPhone' });
    const [, , , signal] = lanClaimMock.mock.calls[0];
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(LAN_CLAIM_TIMEOUT_MS).toBeGreaterThan(0);
  });

  it('surfaces a LAN refusal without dialing the relay (same token would be refused)', async () => {
    lanClaimMock.mockResolvedValueOnce({ paired: false, token: '', error: 'pair token expired' });

    const result = await pairOverInternet({
      host: 'h', httpPort: '9400', pairToken: PAIR_TOKEN, deviceName: 'iPhone',
    });

    expect(result).toEqual({ kind: 'rejected', error: 'pair token expired' });
    expect(relaySockets).toHaveLength(0);
  });
});

describe('pairOverInternet — relay fallback', () => {
  it('claims over the relay when LAN is unreachable, stores the token', async () => {
    lanClaimMock.mockResolvedValueOnce(null); // LAN timed out / unreachable

    const result = await pairOverInternet({
      host: '10.0.0.9', httpPort: '9400', pairToken: PAIR_TOKEN, deviceName: 'iPhone 15',
    });

    expect(result).toEqual({
      kind: 'relay', token: 'SESS-relay-9999', machineName: 'NICOLA-PC', spki: 'AB:CD',
    });
    // The phone dialed the relay with rid_pair derived from the QR token.
    expect(relaySockets).toHaveLength(1);
    expect(relaySockets[0].url).toBe('wss://relay.test/relay');
    expect(captured?.rid).toBe(RID_PAIR);
    expect(captured?.deviceName).toBe('iPhone 15');
    // The session token was persisted under the (hellonexus.com) origin so the
    // runtime relay transport reconnects with it.
    expect(storePhoneTokenMock).toHaveBeenCalledWith('SESS-relay-9999');
  });

  it('maps a relay claim-err to rejected', async () => {
    lanClaimMock.mockResolvedValueOnce(null);
    behavior = 'claim-err';

    const result = await pairOverInternet({
      host: 'h', httpPort: '9400', pairToken: PAIR_TOKEN, deviceName: 'iPhone',
    });

    expect(result).toEqual({ kind: 'rejected', error: 'pair token expired' });
    expect(storePhoneTokenMock).not.toHaveBeenCalled();
  });

  it('maps a relay open error to unreachable', async () => {
    lanClaimMock.mockResolvedValueOnce(null);
    behavior = 'open-error';

    const result = await pairOverInternet({
      host: 'h', httpPort: '9400', pairToken: PAIR_TOKEN, deviceName: 'iPhone',
    });

    expect(result).toEqual({ kind: 'unreachable' });
    expect(storePhoneTokenMock).not.toHaveBeenCalled();
  });
});

describe('pairOverInternet — single rid_pair claim per pair attempt', () => {
  it('opens exactly ONE relay client for the pair rid even if the pair flow fires twice', async () => {
    // The PairRedirect effect can run more than once for the same mount (the
    // instrumented browser trace showed two relay client sockets to the SAME
    // rid with DIFFERENT salts within ~100ms). Both invocations share the same
    // (still in-flight) attempt: LAN unreachable both times, and the relay must
    // be dialed only ONCE.
    lanClaimMock.mockResolvedValue(null); // LAN unreachable for every call

    const params = { host: '10.0.0.9', httpPort: '9400', pairToken: PAIR_TOKEN, deviceName: 'iPhone' };
    // Fire the second call synchronously after the first, before either settles
    // — exactly the double-fire shape from the trace.
    const first = pairOverInternet(params);
    const second = pairOverInternet(params);

    const [r1, r2] = await Promise.all([first, second]);

    // Both resolve to the same successful relay claim...
    expect(r1).toEqual({ kind: 'relay', token: 'SESS-relay-9999', machineName: 'NICOLA-PC', spki: 'AB:CD' });
    expect(r2).toEqual(r1);
    // ...and the two calls collapsed onto a single in-flight attempt (one
    // promise instance), so the rid_pair relay client was opened exactly once
    // (no duplicate → no close 4409 race).
    expect(second).toBe(first);
    expect(relaySockets).toHaveLength(1);
    expect(captured?.rid).toBe(RID_PAIR);
    // The session token is stored once.
    expect(storePhoneTokenMock).toHaveBeenCalledTimes(1);
  });

  it('lets a fresh pair attempt run after the previous one settled', async () => {
    // The in-flight guard clears on settle, so a NEW token (e.g. a re-scan with
    // a fresh QR) dials the relay again rather than being deduped away.
    lanClaimMock.mockResolvedValue(null);

    const r1 = await pairOverInternet({
      host: '10.0.0.9', httpPort: '9400', pairToken: PAIR_TOKEN, deviceName: 'iPhone',
    });
    expect(r1.kind).toBe('relay');
    expect(relaySockets).toHaveLength(1);

    // Same token again, but now the first attempt has settled → a new attempt
    // runs (a fresh relay socket), proving the guard doesn't permanently latch.
    const r2 = await pairOverInternet({
      host: '10.0.0.9', httpPort: '9400', pairToken: PAIR_TOKEN, deviceName: 'iPhone',
    });
    expect(r2.kind).toBe('relay');
    expect(relaySockets).toHaveLength(2);
  });
});

describe('derived rid_pair matches the contract KAT', () => {
  it('rid_pair = deriveRid(derivePairRoot(token))', async () => {
    expect(await deriveRid(await derivePairRoot(PAIR_TOKEN))).toBe(RID_PAIR);
  });
});
