import { useCallback, useEffect, useImperativeHandle, useRef, type PointerEvent as ReactPointerEvent, type Ref } from 'react';
import { applyPinch, fitView, screenToCanvas, zoomAbout } from './whiteboardGeometry';
import { paintStroke, paintStrokes, prepareCanvas } from './whiteboardRender';
import { quantize, shouldCapture, simplify } from './whiteboardSimplify';
import type { Point, Stroke, ViewTransform, WhiteboardTool } from './whiteboardTypes';
import styles from './WhiteboardSurface.module.scss';

// Capture threshold and simplify tolerance are in SCREEN pixels and converted
// to canvas units per-stroke, so the amount of detail kept is what the user can
// actually see rather than an absolute that over-samples when zoomed in and
// destroys detail when zoomed out.
const CAPTURE_GAP_PX = 1.5;
const SIMPLIFY_TOLERANCE_PX = 0.4;

export interface WhiteboardSurfaceHandle {
  /** Live view, including mid-gesture values React state has not seen yet. */
  currentView: () => ViewTransform;
  zoomBy: (factor: number) => void;
}

export interface WhiteboardSurfaceProps {
  strokes: readonly Stroke[];
  view: ViewTransform;
  interactive: boolean;
  tool?: WhiteboardTool;
  penColor?: string;
  penWidth?: number;
  eraserWidth?: number;
  /**
   * Derive the view from the ink instead of the `view` prop: the whole drawing
   * is fitted into the measured box with this many pixels of padding. What the
   * grid tile uses, so a thumbnail always shows the entire board regardless of
   * where the user left the fullscreen view panned.
   */
  fitPadding?: number;
  className?: string;
  ariaLabel?: string;
  onCommitStroke?: (stroke: Stroke) => void;
  onViewChange?: (view: ViewTransform) => void;
  /** Fires on every rendered frame of a pinch so a caller can show a live zoom readout without re-rendering. */
  onViewFrame?: (view: ViewTransform) => void;
  ref?: Ref<WhiteboardSurfaceHandle>;
}

interface ActivePointer {
  id: number;
  point: Point;
}

/**
 * The drawing surface: one transparent ink canvas over a caller-painted
 * background, plus pointer handling.
 *
 * Committed strokes are cached into an offscreen canvas that is rebuilt only
 * when the ink or the view actually changes; a frame during a stroke blits that
 * cache and paints just the in-progress stroke, so cost per frame is flat in
 * the number of strokes already on the board. The cache also makes the eraser
 * correct: `destination-out` composites against the blitted ink, not against a
 * background fill.
 */
export function WhiteboardSurface({
  strokes,
  view,
  interactive,
  tool = 'pen',
  penColor = '#ffffff',
  penWidth = 6,
  eraserWidth = 28,
  fitPadding,
  className,
  ariaLabel,
  onCommitStroke,
  onViewChange,
  onViewFrame,
  ref,
}: WhiteboardSurfaceProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cacheRef = useRef<HTMLCanvasElement | null>(null);
  const sizeRef = useRef({ width: 0, height: 0, dpr: 1 });

  // Mid-gesture state deliberately lives outside React: a pinch or a stroke
  // must not re-render the toolbar 60 times a second.
  const viewRef = useRef<ViewTransform>(view);
  const activeStrokeRef = useRef<Stroke | null>(null);
  const pointersRef = useRef<Map<number, ActivePointer>>(new Map());
  const pinchRef = useRef<{ view: ViewTransform; anchor: Point; spread: number } | null>(null);
  const frameRef = useRef<number | null>(null);
  const cacheDirtyRef = useRef(true);

  // Latest render inputs, read by the rAF callback without re-subscribing it.
  const propsRef = useRef({ strokes, tool, penColor, penWidth, eraserWidth, fitPadding, onViewFrame });
  propsRef.current = { strokes, tool, penColor, penWidth, eraserWidth, fitPadding, onViewFrame };

  // In fit mode the view is a function of the ink and the box, so it is
  // recomputed on every measure and every ink change rather than stored.
  const applyFit = useCallback(() => {
    const { fitPadding: pad, strokes: ink } = propsRef.current;
    if (pad === undefined) return;
    const { width, height } = sizeRef.current;
    viewRef.current = fitView(ink, width, height, pad);
  }, []);

  const rebuildCache = useCallback(() => {
    const { width, height, dpr } = sizeRef.current;
    if (width <= 0 || height <= 0) return;
    let cache = cacheRef.current;
    if (!cache) {
      cache = document.createElement('canvas');
      cacheRef.current = cache;
    }
    const ctx = prepareCanvas(cache, width, height, dpr);
    if (!ctx) return;
    paintStrokes(ctx, propsRef.current.strokes, viewRef.current);
    cacheDirtyRef.current = false;
  }, []);

  const paint = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { width, height, dpr } = sizeRef.current;
    const ctx = prepareCanvas(canvas, width, height, dpr);
    if (!ctx) return;

    if (cacheDirtyRef.current) rebuildCache();
    const cache = cacheRef.current;
    if (cache && cache.width > 0) ctx.drawImage(cache, 0, 0, width, height);

    const active = activeStrokeRef.current;
    if (active) paintStroke(ctx, active, viewRef.current);
  }, [rebuildCache]);

  const scheduleFrame = useCallback(() => {
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      paint();
    });
  }, [paint]);

  // Track the host's box. ResizeObserver rather than a window listener: the
  // panel reflows cells on layout changes that never touch the viewport.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const measure = () => {
      const rect = host.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const next = { width: rect.width, height: rect.height, dpr };
      const prev = sizeRef.current;
      if (prev.width === next.width && prev.height === next.height && prev.dpr === next.dpr) return;
      sizeRef.current = next;
      applyFit();
      cacheDirtyRef.current = true;
      scheduleFrame();
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    return () => observer.disconnect();
  }, [scheduleFrame, applyFit]);

  // A view or ink change from outside (undo, clear, fit, a restored board)
  // invalidates the cache. Skipped while a pinch owns the view, or the
  // committed prop would fight the live gesture value.
  useEffect(() => {
    if (pinchRef.current) return;
    if (fitPadding !== undefined) applyFit();
    else viewRef.current = view;
    cacheDirtyRef.current = true;
    scheduleFrame();
  }, [view, strokes, fitPadding, applyFit, scheduleFrame]);

  useEffect(() => () => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
  }, []);

  useImperativeHandle(ref, () => ({
    currentView: () => viewRef.current,
    zoomBy: (factor: number) => {
      const { width, height } = sizeRef.current;
      const next = zoomAbout(viewRef.current, { x: width / 2, y: height / 2 }, factor);
      viewRef.current = next;
      cacheDirtyRef.current = true;
      scheduleFrame();
      onViewChange?.(next);
    },
  }), [onViewChange, scheduleFrame]);

  const localPoint = useCallback((e: ReactPointerEvent | PointerEvent): Point => {
    const host = hostRef.current;
    if (!host) return { x: 0, y: 0 };
    const rect = host.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }, []);

  const commitActiveStroke = useCallback(() => {
    const active = activeStrokeRef.current;
    activeStrokeRef.current = null;
    if (!active || active.points.length === 0) return;
    const tolerance = SIMPLIFY_TOLERANCE_PX / viewRef.current.scale;
    const points = quantize(simplify(active.points, tolerance));
    onCommitStroke?.({ ...active, points });
  }, [onCommitStroke]);

  const beginPinch = useCallback(() => {
    const pointers = [...pointersRef.current.values()];
    if (pointers.length < 2) return;
    const [a, b] = pointers;
    pinchRef.current = {
      view: viewRef.current,
      anchor: { x: (a.point.x + b.point.x) / 2, y: (a.point.y + b.point.y) / 2 },
      spread: Math.hypot(b.point.x - a.point.x, b.point.y - a.point.y),
    };
  }, []);

  const handlePointerDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (!interactive) return;
    // Middle/right buttons pan on a mouse; they must not start ink.
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const host = hostRef.current;
    if (!host) return;
    host.setPointerCapture(e.pointerId);
    const point = localPoint(e);
    pointersRef.current.set(e.pointerId, { id: e.pointerId, point });

    if (pointersRef.current.size >= 2) {
      // A second finger converts the gesture to a pinch. The dab the first
      // finger already laid down is DISCARDED rather than committed - the user
      // meant to zoom, and a stray dot on every pinch is exactly the artefact
      // that makes a drawing app feel unreliable. Drawing still starts on the
      // first frame of a single-finger touch, so the common case has no
      // wait-and-see latency.
      activeStrokeRef.current = null;
      beginPinch();
      scheduleFrame();
      return;
    }

    const { tool: t, penColor: color, penWidth: pw, eraserWidth: ew } = propsRef.current;
    const canvasPoint = screenToCanvas(point, viewRef.current);
    activeStrokeRef.current = {
      tool: t,
      color: t === 'eraser' ? '#000000' : color,
      width: (t === 'eraser' ? ew : pw) / viewRef.current.scale,
      points: [canvasPoint],
    };
    scheduleFrame();
  }, [interactive, localPoint, beginPinch, scheduleFrame]);

  const handlePointerMove = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (!interactive) return;
    const tracked = pointersRef.current.get(e.pointerId);
    if (!tracked) return;
    tracked.point = localPoint(e);

    const pinch = pinchRef.current;
    if (pinch) {
      const pointers = [...pointersRef.current.values()];
      if (pointers.length < 2) return;
      const [a, b] = pointers;
      const anchor = { x: (a.point.x + b.point.x) / 2, y: (a.point.y + b.point.y) / 2 };
      const spread = Math.hypot(b.point.x - a.point.x, b.point.y - a.point.y);
      const next = applyPinch(pinch.view, pinch.anchor, pinch.spread, anchor, spread);
      viewRef.current = next;
      cacheDirtyRef.current = true;
      propsRef.current.onViewFrame?.(next);
      scheduleFrame();
      return;
    }

    const active = activeStrokeRef.current;
    if (!active) return;
    const canvasPoint = screenToCanvas(tracked.point, viewRef.current);
    const gap = CAPTURE_GAP_PX / viewRef.current.scale;
    if (!shouldCapture(active.points[active.points.length - 1], canvasPoint, gap)) return;
    active.points.push(canvasPoint);
    scheduleFrame();
  }, [interactive, localPoint, scheduleFrame]);

  const endPointer = useCallback((pointerId: number, cancelled: boolean) => {
    pointersRef.current.delete(pointerId);

    if (pinchRef.current) {
      // Hold the pinch until BOTH fingers are up. Ending it on the first lift
      // would turn the remaining finger into a stroke mid-gesture.
      if (pointersRef.current.size === 0) {
        pinchRef.current = null;
        onViewChange?.(viewRef.current);
      }
      return;
    }

    if (cancelled) {
      activeStrokeRef.current = null;
      scheduleFrame();
      return;
    }
    commitActiveStroke();
    scheduleFrame();
  }, [commitActiveStroke, onViewChange, scheduleFrame]);

  const handlePointerUp = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (!interactive) return;
    endPointer(e.pointerId, false);
  }, [interactive, endPointer]);

  const handlePointerCancel = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (!interactive) return;
    endPointer(e.pointerId, true);
  }, [interactive, endPointer]);

  // Wheel zoom for the desktop simulator and a mouse-attached kiosk. Bound
  // natively rather than via onWheel because React's wheel listener is passive
  // and cannot preventDefault the page scroll.
  useEffect(() => {
    const host = hostRef.current;
    if (!host || !interactive) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = host.getBoundingClientRect();
      const anchor = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      const next = zoomAbout(viewRef.current, anchor, Math.exp(-e.deltaY * 0.0015));
      viewRef.current = next;
      cacheDirtyRef.current = true;
      scheduleFrame();
      onViewChange?.(next);
    };
    host.addEventListener('wheel', onWheel, { passive: false });
    return () => host.removeEventListener('wheel', onWheel);
  }, [interactive, onViewChange, scheduleFrame]);

  return (
    <div
      ref={hostRef}
      className={className ? `${styles.host} ${className}` : styles.host}
      // Opts out of the immersive overlay's swipe-to-dismiss so a downward
      // stroke draws instead of closing the board.
      data-panel-no-sheet-swipe={interactive ? 'true' : undefined}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      role={interactive ? 'application' : 'img'}
      aria-label={ariaLabel}
    >
      <canvas ref={canvasRef} className={styles.canvas} />
    </div>
  );
}
