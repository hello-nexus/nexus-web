// The service stores a preview only against a case id, so the image drawn for a PC with no case chosen is kept in this browser's storage.

const KEY = 'nexus.build.noCasePreview';

/** Keeps the PNG; false when storage refused it (full or unavailable). */
export function saveNoCasePreview(png: ArrayBuffer): boolean {
  try {
    const bytes = new Uint8Array(png);
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    localStorage.setItem(KEY, btoa(binary));
    return true;
  } catch {
    return false;
  }
}

/** The kept PNG, or null when none is stored. */
export function loadNoCasePreview(): Blob | null {
  try {
    const encoded = localStorage.getItem(KEY);
    if (!encoded) return null;
    const binary = atob(encoded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: 'image/png' });
  } catch {
    return null;
  }
}
