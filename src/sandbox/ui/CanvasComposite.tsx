// Host element for `ui-canvas`: a GPU canvas drawn by an app-supplied renderer
// module running in its own worker (see canvasHost.ts for the session and the
// protocol). The widget worker places this element and supplies serializable
// props only; every pixel is drawn by the renderer into the host's canvas.
//
// usePanelPreview() is a null-safe context read (defaults false with no
// provider), so this never throws outside the catalog's PanelPreviewProvider.

import { type CSSProperties, useContext, useEffect, useRef, useState } from 'react';
import { Box } from 'lucide-react';
import type { HostProps } from './components';
import { usePanelPreview } from '../../panel/widgets/common/PanelPreviewContext';
import { useTranslation } from '../../lib/i18n';
import { Spinner } from '../../components/common/Spinner/Spinner';
import { SdkAppIdContext } from '../appIdContext';
import {
  acquireCanvas, canvasKey, inViewFromEntries, releaseCanvas, type CanvasClaim, type CanvasPhase, type CanvasSession,
} from './canvasHost';

const wrapStyle: CSSProperties = {
  position: 'relative', display: 'flex', flex: 1, minWidth: 0, minHeight: 0, overflow: 'hidden',
};
// top/left/right/bottom rather than inset: the Q-series panel is Chromium 83.
const overlayStyle: CSSProperties = {
  position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
  padding: 8, textAlign: 'center', color: 'var(--text-dim, currentColor)', fontSize: 12, pointerEvents: 'none',
};
const previewStyle: CSSProperties = {
  display: 'flex', flex: 1, minWidth: 0, minHeight: 0, alignItems: 'center', justifyContent: 'center',
  background: 'var(--surface, rgba(255,255,255,0.06))', borderRadius: 8,
};

let nextMountId = 0;

function plainObject(v: unknown): Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

export function CanvasComposite(p: HostProps) {
  const { t } = useTranslation();
  const preview = usePanelPreview();
  const appId = useContext(SdkAppIdContext);
  const renderer = typeof p.renderer === 'string' ? p.renderer : '';
  const share = typeof p.share === 'string' && p.share.length > 0 ? p.share : null;
  const interactive = !!p.interactive;
  const props = plainObject(p.props);
  const propsJson = JSON.stringify(props);
  // Latest listeners via ref: __events is a fresh object per synced render.
  const eventsRef = useRef(p.__events);
  eventsRef.current = p.__events;
  const propsRef = useRef(props);
  propsRef.current = props;
  const interactiveRef = useRef(interactive);
  interactiveRef.current = interactive;

  const mountIdRef = useRef<string | null>(null);
  if (mountIdRef.current === null) mountIdRef.current = `m${nextMountId++}`;
  const sharedPart = share !== null ? `s:${share}` : mountIdRef.current;

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const sessionRef = useRef<CanvasSession | null>(null);
  const [phase, setPhase] = useState<CanvasPhase>('loading');

  const live = !preview && appId !== undefined && renderer !== '';
  const key = live ? canvasKey({ appId, renderer }, sharedPart) : null;

  // Acquires (or re-acquires after a grid-drag remount) the cached session and
  // reparents its canvas into this mount's wrapper.
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap || key === null || appId === undefined) return;
    const claim: CanvasClaim = {
      interactive: interactiveRef.current,
      props: propsRef.current,
      visible: typeof document === 'undefined' || !document.hidden,
      onMessage: (data) => eventsRef.current?.message?.(data),
    };
    const session = acquireCanvas(key, { appId, renderer }, wrap, claim);
    sessionRef.current = session;
    setPhase(session.phase);
    const unsubscribe = session.subscribe(() => setPhase(session.phase));
    return () => {
      unsubscribe();
      sessionRef.current = null;
      releaseCanvas(key, session, wrap);
    };
  }, [key, appId, renderer]);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (wrap) sessionRef.current?.update(wrap, { interactive });
  }, [interactive, key]);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (wrap) sessionRef.current?.update(wrap, { props: propsRef.current });
  }, [propsJson, key]);

  // Sizes the renderer to the measured box, same ResizeObserver idiom
  // SandboxedWidget uses to size the whole widget tile. Only the holder sizes:
  // a covered tile resizing under the immersive overlay must not shrink the
  // fullscreen render.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || key === null || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => sessionRef.current?.resize(el));
    ro.observe(el);
    return () => ro.disconnect();
  }, [key]);

  // The renderer draws only while its mount is on screen: tab visible and the
  // element intersecting the viewport.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || key === null) return;
    let tabVisible = typeof document === 'undefined' || !document.hidden;
    let inView = true;
    const push = () => sessionRef.current?.update(el, { visible: tabVisible && inView });
    const onVisibility = () => { tabVisible = !document.hidden; push(); };
    document.addEventListener('visibilitychange', onVisibility);
    let io: IntersectionObserver | null = null;
    if (typeof IntersectionObserver !== 'undefined') {
      io = new IntersectionObserver((entries) => {
        inView = inViewFromEntries(entries, inView);
        push();
      }, { threshold: 0.01 });
      io.observe(el);
    }
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      io?.disconnect();
    };
  }, [key]);

  if (preview) {
    return (
      <div style={previewStyle}>
        <Box size={28} color="var(--text-dim, currentColor)" aria-hidden="true" />
      </div>
    );
  }
  if (!live) return null;

  return (
    // With input forwarded, drags on the canvas must not arm the overlay's
    // swipe-down dismiss; exit stays on the grabber pill / ESC.
    <div ref={wrapRef} style={wrapStyle} data-panel-no-sheet-swipe={interactive ? 'true' : undefined}>
      {phase === 'loading' && (
        <div style={overlayStyle}><Spinner size={24} /></div>
      )}
      {phase === 'error' && (
        <div style={overlayStyle}>{t('sdk.canvas.loadError')}</div>
      )}
    </div>
  );
}
