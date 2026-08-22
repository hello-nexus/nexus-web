/**
 * Latest LED frame, shared outside React.
 *
 * The lighting output socket already delivers a full canvas ~30x a second, and
 * every device card wants to draw from it. Routing that through props would
 * re-render the whole device list at frame rate, so the frame lands here and
 * subscribers paint imperatively. One rAF drives every subscriber, and it only
 * fires them when the sequence actually moved.
 */
export interface LedFrame {
  pixels: Uint8Array | null;
  w: number;
  h: number;
  seq: number;
}

let frame: LedFrame = { pixels: null, w: 0, h: 0, seq: 0 };
const subscribers = new Set<(f: LedFrame) => void>();
let rafId: number | null = null;
let deliveredSeq = -1;

export function publishLedFrame(pixels: Uint8Array | null, w: number, h: number): void {
  frame = { pixels, w, h, seq: frame.seq + 1 };
}

/** Clears the frame so consumers fall back to their idle track (lighting off). */
export function clearLedFrame(): void {
  if (frame.pixels === null) return;
  frame = { pixels: null, w: 0, h: 0, seq: frame.seq + 1 };
}

export function subscribeLedFrame(fn: (f: LedFrame) => void): () => void {
  subscribers.add(fn);
  // Paint once immediately so a card mounting between frames is never blank.
  fn(frame);
  if (rafId === null) loop();
  return () => {
    subscribers.delete(fn);
    if (subscribers.size === 0 && rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  };
}

function loop(): void {
  rafId = requestAnimationFrame(loop);
  if (frame.seq === deliveredSeq) return;
  deliveredSeq = frame.seq;
  for (const fn of subscribers) fn(frame);
}
