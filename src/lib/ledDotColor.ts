import type { LedFrame } from './ledFrameStore';

/**
 * The color the service is driving a single LED to, from the output frame, or
 * null when the frame carries nothing for it (no frame index, no bytes for the
 * device this tick, lighting off, relay connection, index past the section).
 * The bytes already include brightness and every per-device adjustment.
 */
export function liveLedColor(frame: LedFrame, frameIndex: number | undefined, ledIndex: number): string | null {
  if (frameIndex === undefined || ledIndex < 0) return null;
  const bytes = frame.devices?.get(frameIndex);
  const o = ledIndex * 3;
  if (!bytes || o + 2 >= bytes.length) return null;
  return `rgb(${bytes[o]}, ${bytes[o + 1]}, ${bytes[o + 2]})`;
}
