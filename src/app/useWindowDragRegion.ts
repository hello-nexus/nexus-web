import { useRef, type MouseEvent as ReactMouseEvent } from 'react';
import { isWindowsAppShell, postWindowDragStart, postWindowAction, NEXUS_WINDOW_ACTIONS } from './windowActions';

// Spread the returned props onto a chrome element (top bar, sidebar brand) to
// make its empty areas drag the window in the Nexus Windows shell.
//
// Why not `-webkit-app-region: drag`: WebView2 turns app-region regions into
// non-client regions, and over the transparent (Mica) WebView2 those clear to
// BLACK during a window resize - the top-bar "black box" artifacting. The
// mousedown -> IPC -> WM_NCLBUTTONDOWN(HTCAPTION) path keeps the element a
// normal (transparent, flicker-free) client region, mirroring how the resize
// strips already avoid app-region. Returns {} outside the Windows shell, where
// the OS title bar (macOS) handles dragging natively.
const NO_DRAG_SELECTOR =
  'button, input, a, select, textarea, [role="button"], [role="option"], [data-no-window-drag]';

export function useWindowDragRegion(): { onMouseDown?: (e: ReactMouseEvent) => void } {
  const lastDownAt = useRef(0);
  if (!isWindowsAppShell()) return {};
  return {
    onMouseDown: (e: ReactMouseEvent) => {
      if (e.button !== 0) return;
      // Clicks on interactive controls (and anything opting out) are not drags.
      if ((e.target as HTMLElement).closest(NO_DRAG_SELECTOR)) return;
      e.preventDefault();
      // Double-click the chrome toggles maximize, same as a native title bar.
      // The first click's WM_NCLBUTTONDOWN move-loop ends on mouseup with no
      // movement, so the second mousedown still reaches us within the window.
      if (e.timeStamp - lastDownAt.current < 500) {
        lastDownAt.current = 0;
        postWindowAction(NEXUS_WINDOW_ACTIONS.toggleMaximize);
        return;
      }
      lastDownAt.current = e.timeStamp;
      postWindowDragStart();
    },
  };
}
