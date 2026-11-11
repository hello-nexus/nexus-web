import { useEffect, useRef, type RefCallback } from 'react';
import { subscribeLedFrame, type LedFrame } from '../lib/ledFrameStore';
import { liveLedColor } from '../lib/ledDotColor';

/** Where one dot's color lives in the output frame: the device's frame byte and the LED's index in its section. */
export interface LiveLedSource {
  frameIndex: number;
  index: number;
}

interface Dot {
  el: HTMLElement;
  source: LiveLedSource | undefined;
  /** Last value written, so an unchanged frame touches no style. */
  applied: string | null;
}

/**
 * Writes the color the service is sending to an LED onto its element, or clears
 * the inline fill (so the stylesheet's grey shows) when the frame carries none.
 */
export function paintLiveLed(dot: Dot, frame: LedFrame): void {
  const bg = dot.source ? liveLedColor(frame, dot.source.frameIndex, dot.source.index) ?? '' : '';
  if (bg === dot.applied) return;
  dot.el.style.background = bg;
  dot.applied = bg;
}

/**
 * Live dot colors from the output frame, written straight onto the elements:
 * routing frames through state would re-render the host at frame rate. Call the
 * returned function per dot as its `ref`; it is re-created each render on
 * purpose, so a changed source repaints at once.
 */
export function useLiveLedDots(): (key: string | number, source: LiveLedSource | undefined) => RefCallback<HTMLElement> {
  const dotsRef = useRef(new Map<string | number, Dot>());
  const latestRef = useRef<LedFrame | null>(null);

  useEffect(() => {
    const dots = dotsRef.current;
    return subscribeLedFrame(f => {
      latestRef.current = f;
      for (const dot of dots.values()) paintLiveLed(dot, f);
    });
  }, []);

  return (key, source) => el => {
    if (!el) { dotsRef.current.delete(key); return; }
    const dot: Dot = { el, source, applied: null };
    dotsRef.current.set(key, dot);
    if (latestRef.current) paintLiveLed(dot, latestRef.current);
  };
}
