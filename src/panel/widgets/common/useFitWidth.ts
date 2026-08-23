import { useLayoutEffect, useState } from 'react';

/// Downscale that fits a clock face to its container width: box inner width /
/// content natural width, capped at 1 so the face never grows past its scss
/// size. Apply the returned scale as `transform: scale()` on the content;
/// offsetWidth/scrollWidth ignore transforms, so measuring the same element the
/// scale is applied to does not feed back.
///
/// `fitHeight` also constrains by the box's height, which a stacked clock
/// layout needs - its lines grow downward, so width alone cannot keep the last
/// line inside the tile. Pair it with a `maxScale` above 1 to let the shorter
/// stacked content grow into the frame it would otherwise leave empty; the box
/// must have a definite height (flex: 1 + min-height: 0) or clientHeight
/// collapses to the content and the scale pins at maxScale.
///
/// Both refs are callback refs: a clock face remounts when the panel swaps
/// design or surface, and a plain ref object would leave the new node
/// unobserved after a resize.
export function useFitWidth(maxScale = 1, fitHeight = false) {
  const [box, setBox] = useState<HTMLElement | null>(null);
  const [content, setContent] = useState<HTMLElement | null>(null);
  const [scale, setScale] = useState(maxScale);

  useLayoutEffect(() => {
    if (!box || !content) return undefined;
    const update = () => {
      const avail = box.clientWidth;
      const natural = content.scrollWidth;
      if (avail <= 0 || natural <= 0) return;
      let next = Math.min(maxScale, avail / natural);
      if (fitHeight) {
        const availH = box.clientHeight;
        const naturalH = content.scrollHeight;
        if (availH > 0 && naturalH > 0) next = Math.min(next, availH / naturalH);
      }
      setScale(next);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(box);
    ro.observe(content);
    return () => ro.disconnect();
  }, [box, content, maxScale, fitHeight]);

  return { boxRef: setBox, contentRef: setContent, scale };
}
