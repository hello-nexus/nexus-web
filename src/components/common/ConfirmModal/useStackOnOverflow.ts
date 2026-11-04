import { useEffect, useLayoutEffect, type RefObject } from 'react';

/**
 * Toggles `stackedClass` on a footer whose one-row layout overflows the card.
 * The class is set on the DOM node directly so a re-measure never reads
 * through a stale stacked state: it is removed, the row is measured, and it is
 * added back only when the row does not fit. The tolerance absorbs subpixel
 * rounding between scrollWidth and clientWidth.
 */
export function measureStack(el: HTMLElement, stackedClass: string) {
  el.classList.remove(stackedClass);
  if (el.scrollWidth > el.clientWidth + 1) el.classList.add(stackedClass);
}

export function useStackOnOverflow(ref: RefObject<HTMLElement | null>, stackedClass: string, active: boolean) {
  // Every commit: the labels (locale) or the buttons present may have changed.
  useLayoutEffect(() => {
    const el = ref.current;
    if (active && el) measureStack(el, stackedClass);
  });

  // Re-measure without a commit. The observer covers box changes (surface,
  // footer, and the buttons present at open whose label width moved); the window resize listener covers
  // a stacked card that no longer changes size when the viewport widens; font
  // loads cover glyph widths changing inside an already-capped card. All three
  // share one frame-deferred measure, which ends in the state it started from
  // when nothing changed, so our own class toggle does not retrigger it.
  useEffect(() => {
    const el = ref.current;
    if (!active || !el) return;
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => measureStack(el, stackedClass));
    };
    let observer: ResizeObserver | undefined;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(schedule);
      observer.observe(el);
      if (el.parentElement) observer.observe(el.parentElement);
      el.querySelectorAll('button').forEach(b => observer?.observe(b));
    }
    window.addEventListener('resize', schedule);
    const fonts = typeof document !== 'undefined' ? document.fonts : undefined;
    fonts?.addEventListener?.('loadingdone', schedule);
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener('resize', schedule);
      fonts?.removeEventListener?.('loadingdone', schedule);
    };
  }, [ref, stackedClass, active]);
}
