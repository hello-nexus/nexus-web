import { useEffect, useState } from 'react';

export type GameOrientation = 'portrait' | 'landscape';

/**
 * Live in-game orientation for the panel games (Snake, Blocks). Combines two
 * signals rather than trusting either alone: `immersiveGrid` (the panel
 * engine's own ResizeObserver-measured column/row fit, recomputed on every
 * render) catches a resize the moment the container reflows, while a
 * `matchMedia` listener catches viewport-level orientation changes that can
 * lag a container reflow (a monitor's OS-level rotation transition runs
 * several hundred ms after the display mode change returns). The result is
 * landscape if EITHER signal says so, so a flip pauses the game as soon as
 * possible and only resumes once both agree the panel is back to portrait.
 */
export function useGameOrientation(immersiveGrid?: { columns: number; rows: number }): GameOrientation {
  const gridLandscape = immersiveGrid ? immersiveGrid.columns > immersiveGrid.rows : false;
  const [mediaLandscape, setMediaLandscape] = useState(gridLandscape);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(orientation: landscape)');
    const update = () => setMediaLandscape(mq.matches);
    update();
    if (mq.addEventListener) {
      mq.addEventListener('change', update);
      return () => mq.removeEventListener('change', update);
    }
    mq.addListener(update);
    return () => mq.removeListener(update);
  }, []);

  return gridLandscape || mediaLandscape ? 'landscape' : 'portrait';
}
