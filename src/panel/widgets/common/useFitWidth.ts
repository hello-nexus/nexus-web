import { useLayoutEffect, useState } from 'react';

/// Downscale that fits a clock face to its container width: box inner width /
/// content natural width, capped at 1 so the face never grows past its scss
/// size. Apply the returned scale as `transform: scale()` on the content;
/// offsetWidth/scrollWidth ignore transforms, so measuring the same element the
/// scale is applied to does not feed back.
///
/// Both refs are callback refs: a clock face remounts when the panel swaps
/// design or surface, and a plain ref object would leave the new node
/// unobserved after a resize.
export function useFitWidth(maxScale = 1) {
  const [box, setBox] = useState<HTMLElement | null>(null);
  const [content, setContent] = useState<HTMLElement | null>(null);
  const [scale, setScale] = useState(maxScale);

  useLayoutEffect(() => {
    if (!box || !content) return undefined;
    const update = () => {
      const avail = box.clientWidth;
      const natural = content.scrollWidth;
      if (avail > 0 && natural > 0) setScale(Math.min(maxScale, avail / natural));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(box);
    ro.observe(content);
    return () => ro.disconnect();
  }, [box, content, maxScale]);

  return { boxRef: setBox, contentRef: setContent, scale };
}
