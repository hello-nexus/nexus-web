// `ui-layer` with gestures and its `ui-manipulable` children. The layer owns
// the pointer bookkeeping (pointers are tracked on the LAYER so a second
// finger landing anywhere joins the gesture on the grabbed child, which is
// how a pinch on a small item actually happens on a touch panel); each child
// registers its transform + event sinks through a context and renders the
// in-flight transform the layer pushes to it. Geometry is in
// manipulableGeometry.ts.

import {
  type CSSProperties, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent,
  createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState,
} from 'react';
import type { HostProps } from './components';
import { toneVar } from './tokens';
import {
  DEFAULT_MAX_SCALE, DEFAULT_MIN_SCALE, DEFAULT_SIZE_FRACTION, applyGesture, basePx, readTransform,
  type GestureStart, type Point, type Transform,
} from './manipulableGeometry';

interface Registration {
  editable: boolean;
  minScale: number;
  maxScale: number;
  get(): Transform;
  setLive(t: Transform | null): void;
  emitChange(t: Transform): void;
  emitPress(): void;
}

interface StageApi {
  register(id: string, reg: Registration): () => void;
  size: { width: number; height: number };
}

const StageContext = createContext<StageApi | null>(null);

interface ActiveGesture {
  id: string;
  reg: Registration;
  start: GestureStart;
  a: { pointerId: number; at: Point };
  b: { pointerId: number; at: Point } | null;
  /** Layer box at gesture start, in viewport px (an immersive body is CSS-scaled). */
  w: number;
  h: number;
  live: Transform;
  moved: boolean;
}

const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

export function Layer(p: HostProps) {
  const gestures = !!p.gestures;
  const interactive = !!p.interactive || gestures;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const regs = useRef(new Map<string, Registration>());
  const gestureRef = useRef<ActiveGesture | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  // Children size themselves against the layer's box in its own CSS px.
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const measure = () => setSize({ width: el.clientWidth, height: el.clientHeight });
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const register = useCallback((id: string, reg: Registration) => {
    regs.current.set(id, reg);
    return () => {
      regs.current.delete(id);
      // Unmounted mid-gesture (the worker dropped it): the pointer's release
      // must not report a change for it.
      if (gestureRef.current?.reg === reg) gestureRef.current = null;
    };
  }, []);
  const api = useMemo<StageApi>(() => ({ register, size }), [register, size]);

  // Leaving gesture mode mid-gesture drops the gesture where it is.
  useEffect(() => {
    if (gestures) return;
    const g = gestureRef.current;
    if (g) { g.reg.setLive(null); gestureRef.current = null; }
  }, [gestures]);

  const pointOf = useCallback((e: ReactPointerEvent): Point => {
    const r = rootRef.current?.getBoundingClientRect();
    return { x: e.clientX - (r?.left ?? 0), y: e.clientY - (r?.top ?? 0) };
  }, []);

  const onPointerDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (!gestures) return;
    const at = pointOf(e);
    const g = gestureRef.current;
    if (g) {
      // Second finger joins the running gesture; the pinch/twist starts from
      // the transform as it is NOW, so nothing jumps on the first move.
      if (g.b || e.pointerId === g.a.pointerId) return;
      g.start = { transform: g.live, a: g.a.at, b: at };
      g.b = { pointerId: e.pointerId, at };
      g.moved = true;
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
      e.preventDefault();
      return;
    }
    const hit = (e.target as Element | null)?.closest?.('[data-manipulable-id]') as HTMLElement | null;
    const id = hit?.dataset.manipulableId;
    const reg = id ? regs.current.get(id) : undefined;
    if (!id || !reg) return;
    const r = e.currentTarget.getBoundingClientRect();
    const transform = reg.get();
    gestureRef.current = { id, reg, start: { transform, a: at }, a: { pointerId: e.pointerId, at }, b: null, w: r.width, h: r.height, live: transform, moved: false };
    if (reg.editable) reg.setLive(transform);
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
    e.preventDefault();
  }, [gestures, pointOf]);

  const onPointerMove = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gestureRef.current;
    if (!g) return;
    const at = pointOf(e);
    if (e.pointerId === g.a.pointerId) g.a = { ...g.a, at };
    else if (g.b && e.pointerId === g.b.pointerId) g.b = { ...g.b, at };
    else return;
    if (!g.moved && Math.hypot(at.x - g.start.a.x, at.y - g.start.a.y) < 6) return;
    g.moved = true;
    if (!g.reg.editable) return;
    g.live = applyGesture(g.start, g.a.at, g.b?.at, g.w, g.h, g.reg.minScale, g.reg.maxScale);
    g.reg.setLive(g.live);
    e.preventDefault();
  }, [pointOf]);

  const endPointer = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gestureRef.current;
    if (!g) return;
    const isA = e.pointerId === g.a.pointerId;
    const isB = g.b !== null && e.pointerId === g.b.pointerId;
    if (!isA && !isB) return;
    if (g.b) {
      // One finger lifted: continue as a plain drag from the current state.
      const remaining = isA ? g.b : g.a;
      g.a = remaining;
      g.b = null;
      g.start = { transform: g.live, a: remaining.at };
      return;
    }
    gestureRef.current = null;
    g.reg.setLive(null);
    if (!g.moved) g.reg.emitPress();
    else if (g.reg.editable) g.reg.emitChange(g.live);
  }, []);

  const style: CSSProperties = {
    position: 'relative',
    overflow: 'hidden',
    // A flex column so a flex-sized child (a host composite filling the stage)
    // gets the layer's full box; positioned children ignore it.
    display: 'flex',
    flexDirection: 'column',
    padding: num(p.padding),
    aspectRatio: p.aspect != null ? String(p.aspect) : undefined,
    background: p.tone ? toneVar(str(p.tone)) : undefined,
    borderRadius: num(p.radius) ?? 0,
    // A growing stage takes the flex share and no more: a fixed 100% height
    // would push any sibling below it (a controls bar under the stage) off the
    // viewport. Every blessed container is a flex box, so the share is real.
    flex: p.grow ? '1 1 0%' : undefined,
    alignSelf: p.grow ? 'stretch' : undefined,
    width: '100%',
    minWidth: 0, minHeight: 0,
    touchAction: gestures ? 'none' : interactive ? 'manipulation' : undefined,
    cursor: interactive ? 'pointer' : undefined,
  };
  // The tap coordinate is resolved against the layer's own box before it crosses
  // back to the worker: the worker has no DOM, so it could not do this itself.
  // A tap that landed on a manipulable is that child's press, not the stage's.
  const onClick = interactive
    ? (e: ReactMouseEvent<HTMLDivElement>) => {
        if ((e.target as Element | null)?.closest?.('[data-manipulable-id]')) return;
        const r = e.currentTarget.getBoundingClientRect();
        p.__events?.press?.({ x: e.clientX - r.left, y: e.clientY - r.top });
      }
    : undefined;
  return (
    <StageContext.Provider value={api}>
      <div
        ref={rootRef}
        style={style}
        onClick={onClick}
        data-layer-gestures={gestures ? 'true' : undefined}
        data-panel-no-sheet-swipe={gestures ? 'true' : undefined}
        onPointerDown={gestures ? onPointerDown : undefined}
        onPointerMove={gestures ? onPointerMove : undefined}
        onPointerUp={gestures ? endPointer : undefined}
        onPointerCancel={gestures ? endPointer : undefined}
      >
        {p.children}
      </div>
    </StageContext.Provider>
  );
}

export function Manipulable(p: HostProps) {
  const stage = useContext(StageContext);
  const id = str(p.id) ?? '';
  const editable = !!p.editable;
  const minScale = num(p.minScale) ?? DEFAULT_MIN_SCALE;
  const maxScale = num(p.maxScale) ?? DEFAULT_MAX_SCALE;
  const transform = readTransform({ x: p.x, y: p.y, scale: p.scale, rotation: p.rotation }, minScale, maxScale);
  const [live, setLive] = useState<Transform | null>(null);
  const eventsRef = useRef(p.__events);
  eventsRef.current = p.__events;
  const transformRef = useRef(transform);
  transformRef.current = transform;

  useEffect(() => {
    if (!stage || !id) return;
    return stage.register(id, {
      editable,
      minScale,
      maxScale,
      get: () => transformRef.current,
      setLive,
      emitChange: (t) => eventsRef.current?.change?.(t),
      emitPress: () => eventsRef.current?.press?.(),
    });
  }, [stage, id, editable, minScale, maxScale]);

  if (!stage || !id) return null;
  const t = live ?? transform;
  const px = basePx(stage.size.width, stage.size.height, num(p.size) ?? DEFAULT_SIZE_FRACTION);
  if (stage.size.width === 0) return null;
  const style: CSSProperties = {
    position: 'absolute',
    left: `${t.x * 100}%`,
    top: `${t.y * 100}%`,
    width: px,
    height: px,
    marginLeft: -px / 2,
    marginTop: -px / 2,
    transform: `rotate(${t.rotation}deg) scale(${t.scale})`,
    zIndex: num(p.z),
    // Inert unless it can be edited or the worker listens for taps, so the
    // stage beneath keeps its own gestures.
    pointerEvents: editable || p.__events?.press ? 'auto' : 'none',
    touchAction: 'none',
    cursor: editable ? 'grab' : undefined,
    outline: p.selected ? '2px dashed var(--accent, rgba(255,255,255,0.75))' : undefined,
    outlineOffset: p.selected ? 4 : undefined,
    borderRadius: 6,
    userSelect: 'none',
    WebkitUserSelect: 'none',
  };
  return (
    <div data-manipulable-id={id} style={style} role={p.alt ? 'img' : undefined} aria-label={str(p.alt)}>
      {p.children}
    </div>
  );
}

const VIDEO_ID = /^[A-Za-z0-9_-]{6,20}$/;

/** YouTube embed by video id, privacy-enhanced host, 16:9 at full width. */
export function YouTube(p: HostProps) {
  const id = str(p.videoId);
  if (!id || !VIDEO_ID.test(id)) return null;
  const autoplay = p.autoplay !== false;
  const src = `https://www.youtube-nocookie.com/embed/${id}?autoplay=${autoplay ? 1 : 0}&mute=${autoplay ? 1 : 0}&playsinline=1&rel=0&modestbranding=1`;
  // Padding-bottom keeps the 16:9 box on engines without aspect-ratio.
  const box: CSSProperties = {
    position: 'relative', width: '100%', height: 0, paddingBottom: '56.25%',
    borderRadius: num(p.radius) ?? 0, overflow: 'hidden', background: '#000', flex: '0 0 auto',
  };
  return (
    <div style={box} data-youtube={id}>
      <iframe
        src={src}
        title={str(p.title) ?? 'YouTube'}
        allow="autoplay; encrypted-media; picture-in-picture"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 0 }}
      />
    </div>
  );
}
