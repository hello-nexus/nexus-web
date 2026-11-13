import type { LedFrame } from './ledFrameStore';
import { deviceLedBytes } from './deviceLedBytes';

/**
 * The color the service is driving a single LED to, from the output frame, or
 * null when the frame carries nothing for it (no frame index, no bytes for the
 * device this tick, lighting off, relay connection, index past the section).
 * The bytes already include brightness and every per-device adjustment.
 */
export function liveLedColor(frame: LedFrame, frameIndex: number | undefined, ledIndex: number): string | null {
  if (ledIndex < 0) return null;
  const bytes = deviceLedBytes(frame.devices, frameIndex, ledIndex + 1);
  if (!bytes) return null;
  const o = ledIndex * 3;
  return `rgb(${bytes[o]}, ${bytes[o + 1]}, ${bytes[o + 2]})`;
}
