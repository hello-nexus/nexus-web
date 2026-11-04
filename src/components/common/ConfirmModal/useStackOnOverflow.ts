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

  // Surface resizes and late font loads. Measuring in a frame, and ending in the
  // state it started from when nothing changed, keeps our own class toggle from
  // re-triggering the observer.
  useEffect(() => {
    const el = ref.current;
    if (!active || !el || typeof ResizeObserver === 'undefined') return;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => measureStack(el, stackedClass));
    });
    observer.observe(el);
    if (el.parentElement) observer.observe(el.parentElement);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [ref, stackedClass, active]);
}
