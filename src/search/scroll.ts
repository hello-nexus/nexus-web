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

type Listener = (ids: readonly string[]) => void;
const listeners = new Set<Listener>();
// Active class-removal timers per anchor id, so a re-request for the same target
// cancels the prior timer instead of letting it strip the restarted shine.
const removalTimers = new Map<string, number>();

/** Ask the app-root scroller to reveal + shine an anchor. A list is in priority
 *  order: the first id that is mounted wins. */
export function requestSearchScroll(target: string | readonly string[]): void {
  const ids = typeof target === 'string' ? [target] : target;
  if (ids.length > 0) listeners.forEach((l) => l(ids));
}

/** Mount once near the app root so deep-link scroll works on any page. */
export function useSearchAnchorScroller(): void {
  useEffect(() => {
    // A newer request supersedes any loop still polling.
    let latest = 0;
    const onRequest: Listener = (ids) => {
      const mine = ++latest;
      let frames = 0;
      const tick = () => {
        if (mine !== latest) return;
        let id = '';
        let el: HTMLElement | null = null;
        for (const candidate of ids) {
          el = document.querySelector<HTMLElement>(`[data-search-anchor="${CSS.escape(candidate)}"]`);
          if (el) { id = candidate; break; }
        }
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
