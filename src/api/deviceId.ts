// Stable per-device identity for pairing dedup.
//
// Every pairing claim (relay AND LAN-direct) carries this id so the service can
// recognise a RE-pair of the same browser/device and REPLACE its existing
// authorized-device session instead of minting a duplicate. The id is generated
// once and persisted in localStorage under the page origin, so it survives
// across pair attempts on the same origin (a QR re-scan reuses it).
//
// Distinct from the benchmark device id in nexusApi.ts (`nexus_benchmark_device_id`),
// which keys anonymous benchmark submissions — different lifecycle, different key.

const DEVICE_ID_KEY = 'nexus.deviceId';

/**
 * Return this browser's stable pairing device id, generating + persisting one on
 * first use. Stable across pairings on the same origin.
 */
export function getDeviceId(): string {
  let id: string | null = null;
  try {
    id = localStorage.getItem(DEVICE_ID_KEY);
  } catch {
    // localStorage unavailable (privacy mode / blocked): fall through to a
    // freshly generated, non-persisted id so the claim still carries one.
  }
  if (id) return id;

  const generated = generateUuid();
  try {
    localStorage.setItem(DEVICE_ID_KEY, generated);
  } catch {
    // Persist best-effort only.
  }
  return generated;
}

// crypto.randomUUID is the canonical source; fall back to getRandomValues-built
// RFC 4122 v4 for the rare runtime (old WebView / non-secure context) without it.
function generateUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try {
      return crypto.randomUUID();
    } catch {
      // Non-secure context can expose the method but throw — fall through.
    }
  }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0'));
  return (
    hex.slice(0, 4).join('') +
    '-' +
    hex.slice(4, 6).join('') +
    '-' +
    hex.slice(6, 8).join('') +
    '-' +
    hex.slice(8, 10).join('') +
    '-' +
    hex.slice(10, 16).join('')
  );
}
