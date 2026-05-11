import { useEffect } from 'react';

export const PANEL_LOCKED_VIEWPORT_CONTENT = 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover';

function ensureViewportMeta() {
  const existing = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  if (existing) return { meta: existing, created: false };

  const meta = document.createElement('meta');
  meta.name = 'viewport';
  document.head.appendChild(meta);
  return { meta, created: true };
}

export function usePanelViewportLock(enabled = true) {
  useEffect(() => {
    if (!enabled) return undefined;
    const { meta, created } = ensureViewportMeta();
    const previousContent = meta.getAttribute('content');
    meta.content = PANEL_LOCKED_VIEWPORT_CONTENT;

    const preventGestureZoom = (event: Event) => {
      event.preventDefault();
    };
    const options: AddEventListenerOptions = { passive: false };
    document.addEventListener('gesturestart', preventGestureZoom, options);
    document.addEventListener('gesturechange', preventGestureZoom, options);
    document.addEventListener('gestureend', preventGestureZoom, options);

    return () => {
      document.removeEventListener('gesturestart', preventGestureZoom, options);
      document.removeEventListener('gesturechange', preventGestureZoom, options);
      document.removeEventListener('gestureend', preventGestureZoom, options);

      if (created) {
        meta.remove();
      } else if (previousContent === null) {
        meta.removeAttribute('content');
      } else {
        meta.content = previousContent;
      }
    };
  }, [enabled]);
}
