import { describe, it, expect } from 'vitest';
import {
  DIR_CLIENT_TO_HOST,
  DIR_HOST_TO_CLIENT,
  deriveAeadKey,
  deriveRelayRoot,
  deriveRid,
  open,
  seal,
} from './relayCrypto';

// Known-answer vectors from the relay-transport crypto contract. These lock
// byte-for-byte interop with the .NET host-side RelayCrypto (HKDF-SHA256 +
// AesGcm). If any of these drift, the panel can no longer talk to the PC over
// the relay — treat a failure here as a protocol break, not a flaky test.
const KAT = {
  token: 'test-session-token-0123456789',
  relayRoot: '36557d360330aad63010a257c870deb9f57c19d222ea630a9a204889eb435270',
  rid: 'E5HaHgqqZJGdG5QZQR_LTQ',
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
