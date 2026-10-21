import { useLayoutEffect, useState } from 'react';

export interface ElementSize { width: number; height: number }

/// Layout size of an HTML element, kept current by a ResizeObserver. Observe a
/// div, not an svg: older Chromium measures svg by bounding box and can miss
/// resizes. A callback ref,
/// so a remounted node is observed again. Transforms do not feed back:
/// clientWidth and clientHeight ignore them.
export function useElementSize() {
  const [node, setNode] = useState<HTMLElement | null>(null);
  const [size, setSize] = useState<ElementSize | null>(null);

  useLayoutEffect(() => {
    if (!node || typeof ResizeObserver === 'undefined') return undefined;
    const update = () => {
      const width = node.clientWidth;
      const height = node.clientHeight;
      if (width <= 0 || height <= 0) return;
      setSize(prev => (prev && prev.width === width && prev.height === height ? prev : { width, height }));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(node);
    return () => ro.disconnect();
  }, [node]);

  return { ref: setNode, size };
}
