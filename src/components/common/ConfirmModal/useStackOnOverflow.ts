import { useEffect, useLayoutEffect, type RefObject } from 'react';

/**
 * Toggles `stackedClass` on a footer whose one-row layout overflows the card.
 * The class is set on the DOM node directly so a re-render never has to
 * measure through a stale stacked state: it is removed, the row is measured,
 * and it is added back only when the row does not fit.
 */
export function useStackOnOverflow(ref: RefObject<HTMLElement | null>, stackedClass: string, active: boolean) {
  // Every commit: the labels (locale) or the buttons present may have changed.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!active || !el) return;
    el.classList.remove(stackedClass);
    if (el.scrollWidth > el.clientWidth) el.classList.add(stackedClass);
  });

  useEffect(() => {
    if (!active) return;
    const onResize = () => {
      const el = ref.current;
      if (!el) return;
      el.classList.remove(stackedClass);
      if (el.scrollWidth > el.clientWidth) el.classList.add(stackedClass);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [ref, stackedClass, active]);
}
