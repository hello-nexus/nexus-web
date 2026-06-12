import { useEffect, useState } from 'react';

/// Scale factor that fits the fixed-pixel keyboard render into its container:
/// container width / native render width, capped at the design zoom so large
/// windows don't blow the keyboard up past its intended size. Attach `ref` to
/// an UNZOOMED wrapper (measuring the zoomed element itself would feed back).
///
/// `ref` is a callback ref on purpose: the stages unmount while other tabs or
/// categories are active, and a plain ref object would leave the new node
/// unobserved on return (stale zoom after a resize on another tab).
export function useFitZoom(nativeWidth: number, maxZoom: number) {
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const [zoom, setZoom] = useState(maxZoom);

  useEffect(() => {
    if (!el) return;
    const update = () => {
      const w = el.clientWidth;
      if (w > 0) setZoom(Math.min(maxZoom, w / nativeWidth));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [el, nativeWidth, maxZoom]);

  return { ref: setEl, zoom };
}
