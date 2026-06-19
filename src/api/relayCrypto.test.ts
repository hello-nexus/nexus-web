import { describe, it, expect } from 'vitest';
import {
  DIR_CLIENT_TO_HOST,
  DIR_HOST_TO_CLIENT,
  deriveAeadBytes,
  deriveAeadKey,
  deriveHttpRid,
  derivePairRoot,
  deriveRelayRoot,
  deriveRid,
  open,
  seal,
} from './relayCrypto';

// Known-answer vectors from the relay-transport crypto contract. These lock
// byte-for-byte interop with the .NET host-side RelayCrypto (HKDF-SHA256 +
// AesGcm). If any of these drift, the panel can no longer talk to the PC over
// the relay - treat a failure here as a protocol break, not a flaky test.
const KAT = {
  token: 'test-session-token-0123456789',
  relayRoot: '36557d360330aad63010a257c870deb9f57c19d222ea630a9a204889eb435270',
  rid: 'E5HaHgqqZJGdG5QZQR_LTQ',
  // rid_http = the REST-over-relay rendezvous id off the SAME relayRoot via the
  // distinct "nexus-relay-http-rendezvous-v1" info string. Distinct from the
  // runtime rid above so the /ws channel and the HTTP tunnel never collide.
  ridHttp: '0jI7tzgoE89ewOpZng6rlA',
  connSalt: '000102030405060708090a0b0c0d0e0f',
  aeadKey: '2af213994553c206b634442d19b45b796710fd2e69efc060a9c10de16bb29e5f',
  plaintext: '{"t":"ping","d":1}',
  nonce: '010000000000000000000000',
  ciphertext: 'b62dce75421fdfc7760de887f5675c9f1aba',
  tag: '87de074f45dc48f1bd17e54d146b70b3',
  frame: '010000000000000000000000b62dce75421fdfc7760de887f5675c9f1aba87de074f45dc48f1bd17e54d146b70b3',
};

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function fromHex(s: string): Uint8Array {
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16);
  return out;
}

describe('relayCrypto known-answer vectors', () => {
  it('derives the relay root from the session token', async () => {
    const root = await deriveRelayRoot(KAT.token);
    expect(hex(root)).toBe(KAT.relayRoot);
  });

  it('derives the rendezvous id (base64url-nopad)', async () => {
    const root = await deriveRelayRoot(KAT.token);
    expect(await deriveRid(root)).toBe(KAT.rid);
  });

  it('derives the HTTP-tunnel rendezvous id (rid_http) distinct from the runtime rid', async () => {
    const root = await deriveRelayRoot(KAT.token);
    expect(await deriveHttpRid(root)).toBe(KAT.ridHttp);
    expect(await deriveHttpRid(root)).not.toBe(KAT.rid);
  });

  it('seals {"t":"ping","d":1} to the exact frame (nonce || ciphertext || tag)', async () => {
    const root = await deriveRelayRoot(KAT.token);
    const key = await deriveAeadKey(root, fromHex(KAT.connSalt));
    // dir=1 counter=0 is the host->client direction in the vector; assert the
    // full frame matches byte-for-byte (this validates the derived aeadKey,
    // nonce layout, ciphertext, and tag all at once).
    const frame = await seal(key, DIR_HOST_TO_CLIENT, 0, KAT.plaintext);
    expect(hex(frame)).toBe(KAT.frame);
    expect(hex(frame.subarray(0, 12))).toBe(KAT.nonce);
    expect(hex(frame.subarray(12, frame.length - 16))).toBe(KAT.ciphertext);
    expect(hex(frame.subarray(frame.length - 16))).toBe(KAT.tag);
  });

  it('opens the KAT frame back to the plaintext', async () => {
    const root = await deriveRelayRoot(KAT.token);
    const key = await deriveAeadKey(root, fromHex(KAT.connSalt));
    const opened = await open(key, fromHex(KAT.frame));
    expect(opened.dir).toBe(DIR_HOST_TO_CLIENT);
    expect(opened.counter).toBe(0);
    expect(opened.plaintext).toBe(KAT.plaintext);
  });
});

// Pre-pair known-answer vectors (Phase 1 internet pairing for brand-new
// phones). The pair root is keyed off the QR `pair` token via a distinct
// HKDF info string; rid_pair and the claim AEAD key then reuse the same
// deriveRid / deriveAeadKey as the runtime session. These lock byte-for-byte
// interop with the .NET host-side RelayCrypto.DerivePairRoot.
const PAIR_KAT = {
  pairToken: 'PAIRTOK-abcdef0123456789',
  pairRoot: 'c0927b2211eef59afdcaf397ac8e97a9e966a1cfcd23c201d882724dd83361ad',
  ridPair: '0BwEM0g8zmt-2llFkxrdrw',
  connSalt: '000102030405060708090a0b0c0d0e0f',
  claimKey: '0a195060337f3a6dbd4ade2d600cefb7decae749d5596d78a6d2b777261f1cbf',
};

describe('relayCrypto pair (pre-pair) known-answer vectors', () => {
  it('derives the pair root from the QR pair token', async () => {
    const root = await derivePairRoot(PAIR_KAT.pairToken);
    expect(hex(root)).toBe(PAIR_KAT.pairRoot);
  });

  it('derives rid_pair via deriveRid (reuses the rendezvous derivation)', async () => {
    const root = await derivePairRoot(PAIR_KAT.pairToken);
    expect(await deriveRid(root)).toBe(PAIR_KAT.ridPair);
  });

  it('derives the claim AEAD key bytes via the connSalt', async () => {
    const root = await derivePairRoot(PAIR_KAT.pairToken);
    const raw = await deriveAeadBytes(root, fromHex(PAIR_KAT.connSalt));
    expect(hex(raw)).toBe(PAIR_KAT.claimKey);
  });

  it('seals/opens a claim frame under the derived claim key', async () => {
    const root = await derivePairRoot(PAIR_KAT.pairToken);
    const key = await deriveAeadKey(root, fromHex(PAIR_KAT.connSalt));
    const claim = '{"type":"claim","deviceName":"iPhone"}';
    const frame = await seal(key, DIR_CLIENT_TO_HOST, 0, claim);
    const opened = await open(key, frame);
    expect(opened.dir).toBe(DIR_CLIENT_TO_HOST);
    expect(opened.plaintext).toBe(claim);
  });
});

describe('relayCrypto seal/open round-trip', () => {
  it('round-trips multiplex frames across several counters', async () => {
    const root = await deriveRelayRoot('another-token-9999');
    const connSalt = crypto.getRandomValues(new Uint8Array(16));
    const key = await deriveAeadKey(root, connSalt);

    const messages = [
      '{"sub":["monitoring"]}',
      '{"t":"monitoring","d":{"cpu":42}}',
      '{"unsub":["monitoring"]}',
    ];
    for (let counter = 0; counter < messages.length; counter++) {
      const frame = await seal(key, DIR_CLIENT_TO_HOST, counter, messages[counter]);
      const opened = await open(key, frame);
      expect(opened.dir).toBe(DIR_CLIENT_TO_HOST);
      expect(opened.counter).toBe(counter);
      expect(opened.plaintext).toBe(messages[counter]);
    }
  });

  it('rejects a tampered frame (GCM tag verify fails)', async () => {
    const root = await deriveRelayRoot('tamper-token');
    const connSalt = crypto.getRandomValues(new Uint8Array(16));
    const key = await deriveAeadKey(root, connSalt);
    const frame = await seal(key, DIR_CLIENT_TO_HOST, 0, '{"t":"ping","d":1}');
    // Flip one ciphertext byte (just past the 12-byte nonce).
    frame[13] ^= 0x01;
    await expect(open(key, frame)).rejects.toThrow();
  });

  it('rejects a frame derived under a different connSalt (wrong key)', async () => {
    const root = await deriveRelayRoot('salt-token');
    const keyA = await deriveAeadKey(root, crypto.getRandomValues(new Uint8Array(16)));
    const keyB = await deriveAeadKey(root, crypto.getRandomValues(new Uint8Array(16)));
    const frame = await seal(keyA, DIR_CLIENT_TO_HOST, 0, '{"t":"ping","d":1}');
    await expect(open(keyB, frame)).rejects.toThrow();
  });
});
