/**
 * Identify-flash state, shared outside React.
 *
 * Pressing Identify makes the hardware blink white; the device card's LED
 * readout has to blink with it or the two disagree. The waveform mirrors the
 * service frame writers (IdentifyFlashHalfPeriodMs in
 * nexus-service/src/Lighting/*LightingFrameWriter.cs) so the card and the
 * hardware stay in phase. Kept out of React for the same reason as the frame
 * store: the blink runs on its own clock and must not re-render the list.
 */

/** Half-period of the square wave, matching the service writers. */
const HALF_PERIOD_MS = 250;

interface Flash { start: number; end: number }

const active = new Map<string, Flash>();
const subscribers = new Set<() => void>();
let rafId: number | null = null;

function loop(): void {
  const now = Date.now();
  for (const [id, f] of active) {
    if (now >= f.end) active.delete(id);
  }
  for (const fn of subscribers) fn();
  rafId = active.size > 0 ? requestAnimationFrame(loop) : null;
}

/** Blink this device's readout for the same window the hardware blinks. */
export function startIdentify(id: string, durationMs: number): void {
  if (!id) return;
  const now = Date.now();
  active.set(id, { start: now, end: now + Math.max(1, durationMs) });
  if (rafId === null) rafId = requestAnimationFrame(loop);
}

/**
 * Blink phase for a device: true = lit, false = dark, null = not identifying
 * (the caller renders its normal readout).
 */
export function identifyPhase(id: string): boolean | null {
  const f = active.get(id);
  if (!f) return null;
  const now = Date.now();
  if (now >= f.end) return null;
  return Math.floor((now - f.start) / HALF_PERIOD_MS) % 2 === 0;
}

export function subscribeIdentify(fn: () => void): () => void {
  subscribers.add(fn);
  return () => { subscribers.delete(fn); };
}
