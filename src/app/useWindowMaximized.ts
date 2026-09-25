import { useEffect, useState } from 'react';

// Slack for DPI rounding between the outer size and the working area.
const MAXIMIZED_TOLERANCE_PX = 4;

// WebView2 raises no maximize event, so infer it from the outer size: a
// maximized window matches the screen's working area (no caption, no taskbar
// gap).
export function useWindowMaximized(): boolean {
  const [maximized, setMaximized] = useState(false);
  useEffect(() => {
    const measure = () => {
      const aw = window.screen.availWidth;
      const ah = window.screen.availHeight;
      setMaximized(
        Math.abs(window.outerWidth - aw) <= MAXIMIZED_TOLERANCE_PX
          && Math.abs(window.outerHeight - ah) <= MAXIMIZED_TOLERANCE_PX,
      );
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);
  return maximized;
}
