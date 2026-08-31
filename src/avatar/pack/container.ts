/**
 * NXPK v1 encrypted pack container reader. Written by
 * scripts/encrypt-pack.mjs; this file is the authoritative byte-layout spec.
 *
 * Layout (all integers little-endian, offsets absolute from file start):
 *   magic    4 bytes ASCII "NXPK"
 *   version  u8 = 1
 *   count    u32 entry count
 *   entries[count]:
 *     pathLen          u16
 *     path             pathLen bytes UTF-8 ('/'-joined, pack-relative)
 *     offset           u64
 *     encryptedLength  u64  (ciphertext + 16-byte GCM tag)
 *     plainLength      u64
 *     iv               12 bytes
 *   payload: per-entry AES-256-GCM ciphertext||tag at the recorded offsets
 *
 * Crypto: one 32-byte content key per pack; per-entry key =
 * HKDF-SHA256(packKey, salt="NXPK/v1", info=entry path), so every entry
 * decrypts under a distinct derived key. The trailing 16-byte auth tag makes
 * the ciphertext WebCrypto-shaped (crypto.subtle AES-GCM expects ct||tag).
 * Integrity: pack.json hashes cover the plaintext; the container relies on
 * the per-entry GCM tags - any flipped byte fails decryption loudly.
 *
 * Decrypted bytes exist ONLY in memory: never written to disk, never turned
 * into object URLs, never cached. Images go through createImageBitmap(Blob)
 * directly (a Blob is an in-memory value; no URL is minted for it).
 */

const HKDF_SALT = new TextEncoder().encode('NXPK/v1');
const IV_BYTES = 12;
const GCM_TAG_BYTES = 16;
const FIXED_HEADER_BYTES = 4 + 1 + 4;

export interface NxPackEntry {
  path: string;
  /** Absolute byte offset of the ciphertext in the container. */
  offset: number;
  /** Ciphertext + 16-byte GCM tag. */
  encryptedLength: number;
  plainLength: number;
  iv: Uint8Array<ArrayBuffer>;
}

function readU64(dv: DataView, offset: number, what: string): number {
  const v = dv.getBigUint64(offset, true);
  if (v > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error(`[nxpack] ${what} exceeds MAX_SAFE_INTEGER`);
  return Number(v);
}

function parseManifest(buffer: ArrayBuffer): Map<string, NxPackEntry> {
  if (buffer.byteLength < FIXED_HEADER_BYTES) throw new Error('[nxpack] truncated container (shorter than the fixed header)');
  const bytes = new Uint8Array(buffer);
  if (bytes[0] !== 0x4e || bytes[1] !== 0x58 || bytes[2] !== 0x50 || bytes[3] !== 0x4b) {
    throw new Error('[nxpack] bad magic: not an NXPK container');
  }
  const version = bytes[4];
  if (version !== 1) throw new Error(`[nxpack] unsupported container version ${String(version)} (reader supports 1)`);

  const dv = new DataView(buffer);
  const count = dv.getUint32(5, true);
  const entries = new Map<string, NxPackEntry>();
  let o = FIXED_HEADER_BYTES;
  const need = (n: number, what: string): void => {
    if (o + n > buffer.byteLength) throw new Error(`[nxpack] truncated container (while reading ${what})`);
  };

  for (let i = 0; i < count; i++) {
    need(2, `entry ${String(i)} path length`);
    const pathLen = dv.getUint16(o, true);
    o += 2;
    need(pathLen + 8 + 8 + 8 + IV_BYTES, `entry ${String(i)} record`);
    const entryPath = new TextDecoder().decode(new Uint8Array(buffer, o, pathLen));
    o += pathLen;
    const offset = readU64(dv, o, `entry "${entryPath}" offset`);
    o += 8;
    const encryptedLength = readU64(dv, o, `entry "${entryPath}" encryptedLength`);
    o += 8;
    const plainLength = readU64(dv, o, `entry "${entryPath}" plainLength`);
    o += 8;
    const iv = new Uint8Array(buffer.slice(o, o + IV_BYTES));
    o += IV_BYTES;

    if (encryptedLength !== plainLength + GCM_TAG_BYTES) {
      throw new Error(`[nxpack] entry "${entryPath}": encryptedLength must equal plainLength + ${String(GCM_TAG_BYTES)}`);
    }
    if (offset + encryptedLength > buffer.byteLength) {
      throw new Error(`[nxpack] entry "${entryPath}": payload extends past the end of the container`);
    }
    entries.set(entryPath, { path: entryPath, offset, encryptedLength, plainLength, iv });
  }
  return entries;
}

/**
 * Random-access decrypting reader over a fully fetched container buffer.
 * v1 holds the whole (encrypted) container in one ArrayBuffer; the manifest
 * parse is separate from payload access, so a later streaming reader can
 * reuse the same entry records against ranged fetches.
 */
export class NxPackReader {
  readonly #buffer: ArrayBuffer;
  readonly #entries: Map<string, NxPackEntry>;
  readonly #hkdfKey: CryptoKey;

  private constructor(buffer: ArrayBuffer, entries: Map<string, NxPackEntry>, hkdfKey: CryptoKey) {
    this.#buffer = buffer;
    this.#entries = entries;
    this.#hkdfKey = hkdfKey;
  }

  /** @param packKey the 32-byte pack content key. */
  static async open(buffer: ArrayBuffer, packKey: Uint8Array): Promise<NxPackReader> {
    if (packKey.length !== 32) throw new Error(`[nxpack] pack key must be 32 bytes, got ${String(packKey.length)}`);
    const entries = parseManifest(buffer);
    // Copy the key into a fresh buffer so WebCrypto sees a plain ArrayBuffer-backed view.
    const hkdfKey = await crypto.subtle.importKey('raw', new Uint8Array(packKey), 'HKDF', false, ['deriveKey']);
    return new NxPackReader(buffer, entries, hkdfKey);
  }

  get paths(): string[] {
    return [...this.#entries.keys()];
  }

  hasEntry(path: string): boolean {
    return this.#entries.has(path);
  }

  entryInfo(path: string): NxPackEntry | undefined {
    return this.#entries.get(path);
  }

  async #entryKey(path: string): Promise<CryptoKey> {
    return crypto.subtle.deriveKey(
      { name: 'HKDF', hash: 'SHA-256', salt: HKDF_SALT, info: new TextEncoder().encode(path) },
      this.#hkdfKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt'],
    );
  }

  /** Decrypts an entry to a fresh in-memory ArrayBuffer (nothing is cached). */
  async readBytes(path: string): Promise<ArrayBuffer> {
    const entry = this.#entries.get(path);
    if (entry === undefined) throw new Error(`[nxpack] no entry "${path}" in container`);
    const key = await this.#entryKey(path);
    const ciphertext = new Uint8Array(this.#buffer, entry.offset, entry.encryptedLength);
    let plain: ArrayBuffer;
    try {
      plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: entry.iv, tagLength: GCM_TAG_BYTES * 8 }, key, ciphertext);
    } catch {
      // WebCrypto throws an opaque OperationError on auth failure; name the cause.
      throw new Error(`[nxpack] AES-GCM authentication failed for "${path}": container corrupt, tampered with, or wrong key`);
    }
    if (plain.byteLength !== entry.plainLength) {
      throw new Error(`[nxpack] entry "${path}": decrypted ${String(plain.byteLength)} bytes, manifest says ${String(entry.plainLength)}`);
    }
    return plain;
  }

  async readText(path: string): Promise<string> {
    return new TextDecoder().decode(await this.readBytes(path));
  }

  async readJson<T>(path: string): Promise<T> {
    return JSON.parse(await this.readText(path)) as T;
  }

  /**
   * Decrypts an image entry wholly in memory: Blob -> createImageBitmap.
   * Never createObjectURL - an object URL would hand the decrypted bytes a
   * fetchable address.
   */
  async readImageBitmap(path: string): Promise<ImageBitmap> {
    return createImageBitmap(new Blob([await this.readBytes(path)]));
  }
}
