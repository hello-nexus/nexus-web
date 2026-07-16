import { useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import {
  clampWindow,
  hitZoneAt,
  msToPx,
  panWindow,
  pxToMs,
  resizeLeftEdge,
  resizeRightEdge,
  snapToEnd,
} from './timelineBrushUtils';
import styles from './TimelineBrush.module.scss';

export interface TimelineBrushSilhouettePoint {
  t: number;
  v: number;
}

export interface TimelineBrushProps {
  /** The full pannable/zoomable domain (e.g. the retained history window). */
  domainStart: number;
  domainEnd: number;
  /** The currently selected window within the domain. */
  from: number;
  to: number;
  /** phase is 'drag' for every intermediate pointer move and the final
   *  keyboard/pointer commit is 'end' - callers debounce on 'drag' and
   *  fetch immediately on 'end'. */
  onChange: (from: number, to: number, phase: 'drag' | 'end') => void;
  /** Background minimap data (e.g. a decimated 7-day series), amplitude-only. */
  silhouette?: readonly TimelineBrushSilhouettePoint[];
  minWindowMs?: number;
  ariaLabel: string;
  ariaValueText: (from: number, to: number) => string;
  height?: number;
  className?: string;
}

const DEFAULT_MIN_WINDOW_MS = 5 * 60_000;
const DEFAULT_HEIGHT = 40;
// Comfortable pointer target for grabbing an edge handle, independent of its
// drawn width, px.
const EDGE_HIT_PX = 8;
// A right-edge drag within this many px of the live edge snaps to it exactly,
// so the caller sees to === domainEnd and can reattach live-follow.
const SNAP_PX = 6;
const PAN_STEP_FRACTION = 0.1;
const RESIZE_STEP_FRACTION = 0.1;

type DragMode = 'pan' | 'resize-left' | 'resize-right';

interface DragState {
  mode: DragMode;
  pointerId: number;
  startXMs: number;
  startFrom: number;
  startTo: number;
}

export function TimelineBrush({
  domainStart, domainEnd, from, to, onChange, silhouette, minWindowMs = DEFAULT_MIN_WINDOW_MS,
  ariaLabel, ariaValueText, height = DEFAULT_HEIGHT, className,
}: TimelineBrushProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const dragRef = useRef<DragState | null>(null);
  // The last reported [from, to] during an active drag - the pointer-up
  // handler reports this back with phase 'end' instead of recomputing from a
  // possibly-stale event.
  const latestRef = useRef<[number, number]>([from, to]);

  useLayoutEffect(() => { latestRef.current = [from, to]; }, [from, to]);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const initialW = el.getBoundingClientRect().width;
    if (initialW > 0) setWidth(Math.round(initialW));
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        const w = entry.contentRect.width;
        if (w > 0) setWidth(Math.round(w));
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const report = (f: number, t: number, phase: 'drag' | 'end') => {
    latestRef.current = [f, t];
    onChange(f, t, phase);
  };

  const localX = (e: { clientX: number }): number => {
    const rect = wrapRef.current?.getBoundingClientRect();
    return rect ? e.clientX - rect.left : 0;
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (width <= 0) return;
    const x = localX(e);
    const fromPx = msToPx(from, domainStart, domainEnd, width);
    const toPx = msToPx(to, domainStart, domainEnd, width);
    const zone = hitZoneAt(x, fromPx, toPx, EDGE_HIT_PX);
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();

    if (zone === 'track') {
      const windowMs = to - from;
      const centerT = pxToMs(x, domainStart, domainEnd, width);
      const [f, t] = clampWindow(centerT - windowMs / 2, centerT + windowMs / 2, domainStart, domainEnd, minWindowMs);
      dragRef.current = { mode: 'pan', pointerId: e.pointerId, startXMs: pxToMs(x, domainStart, domainEnd, width), startFrom: f, startTo: t };
      report(f, t, 'drag');
      return;
    }

    const mode: DragMode = zone === 'left-edge' ? 'resize-left' : zone === 'right-edge' ? 'resize-right' : 'pan';
    dragRef.current = { mode, pointerId: e.pointerId, startXMs: pxToMs(x, domainStart, domainEnd, width), startFrom: from, startTo: to };
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId || width <= 0) return;
    const x = localX(e);
    const nowMs = pxToMs(x, domainStart, domainEnd, width);
    const deltaMs = nowMs - d.startXMs;

    if (d.mode === 'pan') {
      const [f, t] = panWindow(d.startFrom, d.startTo, deltaMs, domainStart, domainEnd);
      report(f, t, 'drag');
    } else if (d.mode === 'resize-left') {
      const f = resizeLeftEdge(d.startTo, d.startFrom + deltaMs, domainStart, minWindowMs);
      report(f, d.startTo, 'drag');
    } else {
      const domainEndPx = msToPx(domainEnd, domainStart, domainEnd, width);
      const candidatePx = snapToEnd(msToPx(d.startTo, domainStart, domainEnd, width) + (x - msToPx(d.startXMs, domainStart, domainEnd, width)), domainEndPx, SNAP_PX);
      const t = resizeRightEdge(d.startFrom, pxToMs(candidatePx, domainStart, domainEnd, width), domainEnd, minWindowMs);
      report(d.startFrom, t, 'drag');
    }
  };

  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    if (e.currentTarget.hasPointerCapture(d.pointerId)) e.currentTarget.releasePointerCapture(d.pointerId);
    dragRef.current = null;
    report(latestRef.current[0], latestRef.current[1], 'end');
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const windowMs = to - from;
    switch (e.key) {
      case 'ArrowLeft': {
        e.preventDefault();
        if (e.shiftKey) {
          const newWidth = Math.max(minWindowMs, windowMs * (1 - RESIZE_STEP_FRACTION));
          report(Math.max(domainStart, to - newWidth), to, 'end');
        } else {
          const [f, t] = panWindow(from, to, -windowMs * PAN_STEP_FRACTION, domainStart, domainEnd);
          report(f, t, 'end');
        }
        break;
      }
      case 'ArrowRight': {
        e.preventDefault();
        if (e.shiftKey) {
          const newWidth = Math.min(domainEnd - domainStart, windowMs * (1 + RESIZE_STEP_FRACTION));
          report(Math.max(domainStart, to - newWidth), to, 'end');
        } else {
          const [f, t] = panWindow(from, to, windowMs * PAN_STEP_FRACTION, domainStart, domainEnd);
          report(f, t, 'end');
        }
        break;
      }
      case 'Home': {
        e.preventDefault();
        report(domainStart, Math.min(domainEnd, domainStart + windowMs), 'end');
        break;
      }
      case 'End': {
        e.preventDefault();
        report(Math.max(domainStart, domainEnd - windowMs), domainEnd, 'end');
        break;
      }
    }
  };

  const fromPx = width > 0 ? msToPx(from, domainStart, domainEnd, width) : 0;
  const toPx = width > 0 ? msToPx(to, domainStart, domainEnd, width) : 0;

  const silhouettePath = (() => {
    if (!silhouette || silhouette.length === 0 || width <= 0) return null;
    let min = Infinity;
    let max = -Infinity;
    for (const p of silhouette) {
      if (p.v < min) min = p.v;
      if (p.v > max) max = p.v;
    }
    if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
    const span = max - min || 1;
    const top = 4;
    const bottom = height - 4;
    const toY = (v: number) => bottom - ((v - min) / span) * (bottom - top);
    const pts = silhouette.map(p => `${msToPx(p.t, domainStart, domainEnd, width).toFixed(1)},${toY(p.v).toFixed(1)}`);
    return `M0,${bottom} L${pts.join(' L')} L${width},${bottom} Z`;
  })();

  return (
    <div
      ref={wrapRef}
      className={`${styles.root} ${className ?? ''}`}
      style={{ height }}
      role="slider"
      tabIndex={0}
      aria-label={ariaLabel}
      aria-valuemin={domainStart}
      aria-valuemax={domainEnd}
      aria-valuenow={to}
      aria-valuetext={ariaValueText(from, to)}
      aria-orientation="horizontal"
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <svg className={styles.svg} width={width} height={height} viewBox={`0 0 ${Math.max(1, width)} ${height}`} preserveAspectRatio="none">
        <rect className={styles.track} x={0} y={0} width={Math.max(1, width)} height={height} />
        {silhouettePath && <path className={styles.silhouette} d={silhouettePath} />}
        <rect className={styles.window} x={fromPx} y={0} width={Math.max(1, toPx - fromPx)} height={height} />
        <rect className={styles.edge} x={fromPx - 1} y={0} width={2} height={height} />
        <rect className={styles.edge} x={toPx - 1} y={0} width={2} height={height} />
      </svg>
    </div>
  );
}
