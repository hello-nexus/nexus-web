import { useCallback, useEffect, useRef, useState } from 'react';

export const BACKGROUND_HOVER_DELAY_MS = 200;

/**
 * Reveals the background-edit highlight only after the pointer has rested on the background for
 * the delay; leaving it hides at once and cancels a pending reveal. `onReveal` runs just before it shows.
 */
export function useBackgroundHoverIntent(onReveal: () => void): { revealed: boolean; setOver: (over: boolean) => void } {
  const [revealed, setRevealed] = useState(false);
  const overRef = useRef(false);
  const timerRef = useRef(0);
  const onRevealRef = useRef(onReveal);
  useEffect(() => { onRevealRef.current = onReveal; });
  useEffect(() => () => window.clearTimeout(timerRef.current), []);
  const setOver = useCallback((over: boolean) => {
    if (overRef.current === over) return;
    overRef.current = over;
    window.clearTimeout(timerRef.current);
    if (!over) {
      setRevealed(false);
      return;
    }
    timerRef.current = window.setTimeout(() => {
      onRevealRef.current();
      setRevealed(true);
    }, BACKGROUND_HOVER_DELAY_MS);
  }, []);
  return { revealed, setOver };
}
