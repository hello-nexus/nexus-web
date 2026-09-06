// End-to-end crypto for the cloud relay fallback transport.
//
// The relay (api.hellonexus.com/relay) is an opaque byte-forwarder: it only
// ever sees the rendezvous id (`rid`) and the per-connection salt, both of
// which are public (HKDF is one-way, so neither yields the relay root). All
// confidentiality + integrity is end-to-end via AES-256-GCM between this
// client and the PC (nexus-service). This module MUST interop byte-for-byte
// with the .NET `RelayCrypto` (HKDF-SHA256 + AesGcm) on the host side; the
// known-answer vectors in relayCrypto.test.ts lock that contract.
//
// Derivations (HKDF-SHA256, RFC 5869; empty salt = zero-length):
//   relayRoot = HKDF(IKM=utf8(token),   salt=∅,        info="nexus-relay-root-v1",       L=32)
//   rid       = base64url-nopad(
//               HKDF(IKM=relayRoot,      salt=∅,        info="nexus-relay-rendezvous-v1", L=16))
//   aeadKey   = HKDF(IKM=relayRoot,      salt=connSalt, info="nexus-relay-aead-v1",       L=32)
//
// Frame (AES-256-GCM, AAD empty):
//   frame = nonce(12) || ciphertext || tag(16)
//   nonce = [dir(1)] [counter(8, big-endian)] [0,0,0]
//   dir = 1 host->client, 2 client->host; counter starts 0, +1 per frame per
//   sender per connection.
//
// Protocol v2 in-band rekey (defeats a frame recorded on one connection being
// replayed on a later connection that reuses the same client-chosen connSalt):
// immediately after the channel opens, the client seals {"c":"hello2"} under
// aeadKey (K0) as its first frame; a v2 host replies under K0 with
// {"c":"hn","hn":<base64url-nopad 16B>}, and the client switches to
// K1 = deriveRekeyedAeadKey(relayRoot, connSalt, hostNonce), counters reset to
// 0. A v1 host (anything else, or no reply within REKEY_TIMEOUT_MS) leaves the
// channel on K0.

const ROOT_INFO = 'nexus-relay-root-v1';
const PAIRROOT_INFO = 'nexus-relay-pairroot-v1';
const RENDEZVOUS_INFO = 'nexus-relay-rendezvous-v1';
const HTTP_RENDEZVOUS_INFO = 'nexus-relay-http-rendezvous-v1';
const AEAD_INFO = 'nexus-relay-aead-v1';
const REKEY_INFO = 'nexus-relay-aead-v2';

/** The client's first sealed frame on every rekey-capable channel. */
export const REKEY_HELLO2 = '{"c":"hello2"}';
/** How long the client waits for a v2 host's `hn` reply before falling back to K0. */
export const REKEY_TIMEOUT_MS = 3000;

const NONCE_LEN = 12;
const TAG_LEN = 16;

/** Nonce direction byte for frames sent BY this endpoint (the relay client). */
export const DIR_CLIENT_TO_HOST = 2;
/** Nonce direction byte expected on frames RECEIVED by this endpoint. */
export const DIR_HOST_TO_CLIENT = 1;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

/** HKDF-SHA256 (RFC 5869). `salt` empty array = zero-length salt. */
async function hkdf(ikm: Uint8Array, salt: Uint8Array, info: string, length: number): Promise<Uint8Array> {
  const baseKey = await crypto.subtle.importKey('raw', toArrayBuffer(ikm), 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: toArrayBuffer(salt),
      info: toArrayBuffer(textEncoder.encode(info)),
    },
    baseKey,
    length * 8,
  );
  return new Uint8Array(bits);
}

/** relayRoot = HKDF(IKM=utf8(token), salt=∅, info="nexus-relay-root-v1", L=32). */
export async function deriveRelayRoot(token: string): Promise<Uint8Array> {
  return hkdf(textEncoder.encode(token), new Uint8Array(0), ROOT_INFO, 32);
}

/**
 * pairRoot = HKDF(IKM=utf8(pairToken), salt=∅, info="nexus-relay-pairroot-v1", L=32).
 *
 * The pre-pair analogue of deriveRelayRoot: keyed off the QR `pair` token
 * instead of a session token. A brand-new phone derives this from the scanned
 * QR, then feeds it through the SAME deriveRid/deriveAeadKey as a session root
 * to rendezvous with the PC over the relay and run a single sealed claim. The
 * distinct `info` string means a pair root and a session root for the same
 * input bytes never collide on an rid. Interops byte-for-byte with the .NET
 * RelayCrypto.DerivePairRoot on the host side.
 */
export async function derivePairRoot(pairToken: string): Promise<Uint8Array> {
  return hkdf(textEncoder.encode(pairToken), new Uint8Array(0), PAIRROOT_INFO, 32);
}

/** rid = base64url-nopad(HKDF(IKM=relayRoot, salt=∅, info="nexus-relay-rendezvous-v1", L=16)). */
export async function deriveRid(relayRoot: Uint8Array): Promise<string> {
  const raw = await hkdf(relayRoot, new Uint8Array(0), RENDEZVOUS_INFO, 16);
  return base64UrlNoPad(raw);
}

/**
 * rid_http = base64url-nopad(HKDF(IKM=relayRoot, salt=∅, info="nexus-relay-http-rendezvous-v1", L=16)).
 *
 * The rendezvous id for the SECOND relay channel per session - the REST tunnel
 * (Phase 2 REST-over-relay) that carries the panel's HTTP calls (device list,
 * layout, controls) when off-LAN. Derived from the SAME relayRoot as the
 * runtime rid (deriveRid), but a distinct HKDF info string means the two never
 * collide, so the proven runtime `/ws` channel and the HTTP tunnel rendezvous
 * independently. Interops byte-for-byte with the .NET RelayCrypto.DeriveHttpRid.
 */
export async function deriveHttpRid(relayRoot: Uint8Array): Promise<string> {
  const raw = await hkdf(relayRoot, new Uint8Array(0), HTTP_RENDEZVOUS_INFO, 16);
  return base64UrlNoPad(raw);
}

/** Raw aeadKey HKDF output: HKDF(IKM=root, salt=connSalt, info="nexus-relay-aead-v1", L=32). */
export async function deriveAeadBytes(root: Uint8Array, connSalt: Uint8Array): Promise<Uint8Array> {
  return hkdf(root, connSalt, AEAD_INFO, 32);
}

/** aeadKey = HKDF(IKM=relayRoot, salt=connSalt, info="nexus-relay-aead-v1", L=32), imported for AES-GCM. */
export async function deriveAeadKey(relayRoot: Uint8Array, connSalt: Uint8Array): Promise<CryptoKey> {
  const raw = await deriveAeadBytes(relayRoot, connSalt);
  return crypto.subtle.importKey('raw', toArrayBuffer(raw), 'AES-GCM', false, ['encrypt', 'decrypt']);
}

/** Raw K1 HKDF output: HKDF(IKM=relayRoot, salt=connSalt||hostNonce, info="nexus-relay-aead-v2", L=32). */
export async function deriveRekeyedAeadBytes(relayRoot: Uint8Array, connSalt: Uint8Array, hostNonce: Uint8Array): Promise<Uint8Array> {
  const combinedSalt = new Uint8Array(connSalt.length + hostNonce.length);
  combinedSalt.set(connSalt, 0);
  combinedSalt.set(hostNonce, connSalt.length);
  return hkdf(relayRoot, combinedSalt, REKEY_INFO, 32);
}

/**
 * K1 = HKDF(IKM=relayRoot, salt=connSalt||hostNonce, info="nexus-relay-aead-v2", L=32), imported for AES-GCM.
 * The post-handshake rekeyed key: connSalt is still this connection's own
 * salt, but concatenating the host's fresh random nonce means K1 cannot be
 * reproduced by presenting a recorded connSalt on a different connection.
 */
export async function deriveRekeyedAeadKey(relayRoot: Uint8Array, connSalt: Uint8Array, hostNonce: Uint8Array): Promise<CryptoKey> {
  const raw = await deriveRekeyedAeadBytes(relayRoot, connSalt, hostNonce);
  return crypto.subtle.importKey('raw', toArrayBuffer(raw), 'AES-GCM', false, ['encrypt', 'decrypt']);
}

interface HostNonceMessage {
  c?: string;
  hn?: string;
}

/** Parse a K0 frame's plaintext as the v2 host's rekey-nonce reply; null if it is not one (legacy host). */
export function parseHostNonce(plaintext: string): string | null {
  let msg: HostNonceMessage;
  try {
    msg = JSON.parse(plaintext) as HostNonceMessage;
  } catch {
    return null;
  }
  return msg.c === 'hn' && typeof msg.hn === 'string' && msg.hn.length > 0 ? msg.hn : null;
}

/**
 * Seal a UTF-8 plaintext string into a relay frame.
 * frame = nonce(12) || ciphertext || tag(16); WebCrypto appends the GCM tag
 * to the ciphertext, so the returned buffer already has the correct layout.
 */
export async function seal(key: CryptoKey, dir: number, counter: number, plaintextStr: string): Promise<Uint8Array> {
  const nonce = buildNonce(dir, counter);
  const plaintext = textEncoder.encode(plaintextStr);
  const ctWithTag = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: toArrayBuffer(nonce), tagLength: TAG_LEN * 8 }, key, toArrayBuffer(plaintext)),
  );
  const frame = new Uint8Array(NONCE_LEN + ctWithTag.length);
  frame.set(nonce, 0);
  frame.set(ctWithTag, NONCE_LEN);
  return frame;
}

export interface OpenedFrame {
  dir: number;
  counter: number;
  plaintext: string;
}

/**
 * Open a relay frame, verifying the GCM tag. Throws on a malformed (too
 * short) frame or a tag-verify failure; callers MUST treat a throw as a
 * tampered/forged frame and close the channel.
 */
export async function open(key: CryptoKey, frame: Uint8Array): Promise<OpenedFrame> {
  if (frame.length < NONCE_LEN + TAG_LEN) {
    throw new Error('relay frame too short');
  }
  const nonce = frame.subarray(0, NONCE_LEN);
  const ctWithTag = frame.subarray(NONCE_LEN);
  const plaintextBuf = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(nonce), tagLength: TAG_LEN * 8 },
    key,
    toArrayBuffer(ctWithTag),
  );
  const dir = nonce[0];
  // counter is the 8-byte big-endian field after the dir byte.
  let counter = 0;
  for (let i = 1; i <= 8; i++) {
    counter = counter * 256 + nonce[i];
  }
  return { dir, counter, plaintext: textDecoder.decode(plaintextBuf) };
}

function buildNonce(dir: number, counter: number): Uint8Array {
  const nonce = new Uint8Array(NONCE_LEN);
  nonce[0] = dir & 0xff;
  // counter as 8-byte big-endian in bytes 1..8; bytes 9..11 stay zero.
  // A control-only relay connection never emits anywhere near 2^53 frames, so
  // plain (double) number arithmetic via division is exact and avoids BigInt
  // (which the Vite build target down-levels). The top 3 of the 8 counter
  // bytes therefore stay zero in practice; encode the low 53 bits big-endian.
  let c = counter;
  for (let i = 8; i >= 1; i--) {
    nonce[i] = c % 256;
    c = Math.floor(c / 256);
  }
  return nonce;
}

/** base64url without padding (RFC 4648 §5). */
export function base64UrlNoPad(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Inverse of base64UrlNoPad: base64url (no padding) to raw bytes. */
export function base64UrlDecode(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const binary = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// Narrow a Uint8Array to a tight ArrayBuffer for the WebCrypto API. A subarray
// view may sit on a larger backing buffer; slicing the exact range avoids
// feeding stray bytes to crypto.subtle.
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
