// The display's widget label field holds this many bytes of UTF-8.
export const GLACIAL_LABEL_MAX_BYTES = 17;

const encoder = new TextEncoder();

/** Cuts text to at most maxBytes of UTF-8 on a character boundary. */
export function truncateUtf8(text: string, maxBytes: number): string {
  let bytes = 0;
  let out = '';
  for (const ch of text) {
    const size = encoder.encode(ch).length;
    if (bytes + size > maxBytes) break;
    bytes += size;
    out += ch;
  }
  return out;
}
