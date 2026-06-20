import { useEffect } from 'react';

// Deep-link scroll: a search result names an anchor id; after the palette
// navigates, the target page may still be mounting, so we poll for the element
// by animation frame - waiting on its actual mount, not a fixed delay - then
// scroll it into view and play a full-body shine.

const HIGHLIGHT_CLASS = 'nexus-search-anchor-active';
// Cap the wait so a never-mounting anchor (wrong platform, deleted control)
// gives up rather than polling forever. A page mounts well within this.
const MAX_FRAMES = 180;
// Must outlast the CSS shine animation, or the class is pulled mid-shine.
const HIGHLIGHT_MS = 2000;

type Listener = (id: string) => void;
const listeners = new Set<Listener>();
// Active class-removal timers per anchor id, so a re-request for the same target
// cancels the prior timer instead of letting it strip the restarted shine.
const removalTimers = new Map<string, number>();

/** Ask the app-root scroller to reveal + shine the anchor with this id. */
export function requestSearchScroll(id: string): void {
  listeners.forEach((l) => l(id));
}

/** Mount once near the app root so deep-link scroll works on any page. */
export function useSearchAnchorScroller(): void {
  useEffect(() => {
    const onRequest: Listener = (id) => {
      let frames = 0;
      const selector = `[data-search-anchor="${CSS.escape(id)}"]`;
      const tick = () => {
        const el = document.querySelector<HTMLElement>(selector);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          // Restart the animation if it's still mid-play from a prior hit.
          el.classList.remove(HIGHLIGHT_CLASS);
          void el.offsetWidth;
          el.classList.add(HIGHLIGHT_CLASS);
          const prev = removalTimers.get(id);
          if (prev) clearTimeout(prev);
          removalTimers.set(id, window.setTimeout(() => {
            el.classList.remove(HIGHLIGHT_CLASS);
            removalTimers.delete(id);
          }, HIGHLIGHT_MS));
          return;
        }
        if (frames++ < MAX_FRAMES) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };
    listeners.add(onRequest);
    return () => { listeners.delete(onRequest); };
  }, []);
}
