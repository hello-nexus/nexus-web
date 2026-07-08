import { useEffect, useRef, useState, type RefObject } from 'react';

/**
 * Observes whether the referenced element intersects the viewport. Demo
 * sections gate their tickers / WebGL loops on this so an off-screen slide
 * costs nothing; with `once` the value latches true (reveal animations).
 */
export function useInViewport<T extends Element>(
  options?: { threshold?: number; once?: boolean },
): [RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);
  const threshold = options?.threshold ?? 0.15;
  const once = options?.once ?? false;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          setInView(true);
          if (once) io.disconnect();
        } else if (!once) {
          setInView(false);
        }
      }
    }, { threshold });
    io.observe(el);
    return () => io.disconnect();
  }, [threshold, once]);

  return [ref, inView];
}
