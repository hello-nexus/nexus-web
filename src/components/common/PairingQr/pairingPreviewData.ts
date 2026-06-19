// Preview fixture for the shared PairingQrView storybook entry: fake payload,
// untranslated by design. ONE complete size-independent snapshot. The QR is a
// decorative deterministic pattern (it encodes nothing); expiresAt is
// mount-relative by design, frozen by the caller via a useState initializer.
import type { PanelPhonePairQr } from '../../../api/panel';

// 21x21 QR-look grid: three 7x7 finder patterns + arithmetic-hash fill
// (~40% density). Deterministic - no Math.random.
function buildQrDataUrl(): string {
  const n = 21;
  const cell = 8;
  const inFinder = (x: number, y: number) =>
    (x < 7 && y < 7) || (x >= n - 7 && y < 7) || (x < 7 && y >= n - 7);
  const finderDark = (x: number, y: number) => {
    const fx = x >= n - 7 ? x - (n - 7) : x;
    const fy = y >= n - 7 ? y - (n - 7) : y;
    const ring = fx === 0 || fy === 0 || fx === 6 || fy === 6;
    const center = fx >= 2 && fx <= 4 && fy >= 2 && fy <= 4;
    return ring || center;
  };
  let rects = '';
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const dark = inFinder(x, y) ? finderDark(x, y) : (x * x * 3 + y * y * 7 + x * y) % 5 < 2;
      if (dark) rects += `<rect x="${x * cell}" y="${y * cell}" width="${cell}" height="${cell}"/>`;
    }
  }
  const size = n * cell;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">`
    + `<rect width="${size}" height="${size}" fill="#fff"/>`
    + `<g fill="#1a1a1a">${rects}</g></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const QR_DATA_URL = buildQrDataUrl();

export function pairingPreviewQr(now: number): PanelPhonePairQr {
  return {
    url: 'https://hellonexus.com/r/preview',
    qrDataUrl: QR_DATA_URL,
    machineName: 'Nexus-PC',
    ttlSeconds: 55,
    expiresAt: now + 55_000,
  };
}
