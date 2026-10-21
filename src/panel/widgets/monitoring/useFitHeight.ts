import { useLayoutEffect, useState } from 'react';

// Scale factor (max 1) that shrinks `content` to the height of its flex-sized
// `box`. Reads offsetHeight, which ignores the transform it drives.
export function useFitHeight() {
  const [box, setBox] = useState<HTMLElement | null>(null);
  const [content, setContent] = useState<HTMLElement | null>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    if (!box || !content) return undefined;
    const update = () => {
      const avail = box.clientHeight;
      const natural = content.offsetHeight;
      if (avail <= 0 || natural <= 0) return;
      setScale(Math.min(1, avail / natural));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(box);
    ro.observe(content);
    return () => ro.disconnect();
  }, [box, content]);

  return { boxRef: setBox, contentRef: setContent, scale };
}
