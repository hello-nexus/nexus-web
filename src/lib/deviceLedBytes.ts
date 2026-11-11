/**
 * A device's section of the output frame's per-device bytes, or null when the
 * frame has none for it or the section is shorter than `minLeds` LEDs.
 */
export function deviceLedBytes(
  devices: ReadonlyMap<number, Uint8Array> | undefined,
  frameIndex: number | undefined,
  minLeds = 1,
): Uint8Array | null {
  if (frameIndex === undefined) return null;
  const bytes = devices?.get(frameIndex);
  return bytes && minLeds > 0 && bytes.length >= minLeds * 3 ? bytes : null;
}
