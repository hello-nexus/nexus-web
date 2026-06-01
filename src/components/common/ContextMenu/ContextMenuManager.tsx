// installContextMenuSuppressor is the side-effect-free worker that the
// ContextMenuManager mount uses; tests import it directly.
 
import { useEffect } from 'react';

// Suppresses the browser's default right-click menu app-wide (nothing is
// drawn in its place).
//
// Component-local onContextMenu handlers (e.g. the cooling CurveEditor point
// delete) keep working: if they call preventDefault() on the React synthetic
// event, the native event is flagged defaultPrevented before it reaches this
// document listener and we skip it.
export function installContextMenuSuppressor(target: EventTarget = document): () => void {
  const onContextMenu = (e: Event) => {
    const mouseEvent = e as MouseEvent;
    if (mouseEvent.defaultPrevented) return;
    mouseEvent.preventDefault();
  };
  target.addEventListener('contextmenu', onContextMenu);
  return () => target.removeEventListener('contextmenu', onContextMenu);
}

export function ContextMenuManager() {
  useEffect(() => installContextMenuSuppressor(document), []);
  return null;
}
