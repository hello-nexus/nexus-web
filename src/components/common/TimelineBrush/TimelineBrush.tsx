import { useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import {
  MIN_BOX_WINDOW_MS,
  buildSilhouettePathD,
  clampWindow,
  hitZoneAt,
  msToPx,
  panWindow,
  pxToMs,
  resizeLeftEdge,
  resizeRightEdge,
  snapToEnd,
  type BrushHitZone,
} from './timelineBrushUtils';
import styles from './TimelineBrush.module.scss';

export interface TimelineBrushSilhouettePoint {
  t: number;
  v: number;
}

export interface TimelineBrushProps {
  /** The full pannable/zoomable domain (e.g. the seek-bar strip's own span). */
  domainStart: number;
  domainEnd: number;
  /** The currently selected window within the domain. */
  from: number;
  to: number;
  /** phase is 'drag' for every intermediate pointer move and the final
   *  keyboard/pointer commit is 'end' - callers debounce on 'drag' and
   *  fetch immediately on 'end'. */
  onChange: (from: number, to: number, phase: 'drag' | 'end') => void;
  /** Background minimap data (e.g. a decimated series over the strip),
   *  amplitude-only, rendered as a plain fill silhouette (no stroke, no
   *  gradient - distinct from the hero chart's own gradient-fill treatment). */
  silhouette?: readonly TimelineBrushSilhouettePoint[];
  minWindowMs?: number;
  ariaLabel: string;
  ariaValueText: (from: number, to: number) => string;
  /** Renders the block's own domainStart/domainEnd, docked INSIDE the block
   *  (left-aligned at the left edge, right-aligned at the right edge) rather
   *  than tracking the selected window - purely decorative (pointer-events:
   *  none), never part of the drag/click hit-testing. Returns both labels
   *  together so the caller can decide together whether to include the day
   *  (the two edges may fall on different calendar days). Omit to render no
   *  labels. */
  formatEdgeLabels?: (start: number, end: number) => readonly [string, string];
  height?: number;
  className?: string;
}

// Exported so a sibling control (e.g. the monitoring history range picker)
// can pin its own height to match this block exactly instead of guessing at
// a duplicated pixel value.
export const TIMELINE_BRUSH_DEFAULT_HEIGHT = 40;
// Reserved lane on each side of the track for the docked edge labels -
// labels live inside the rounded block but must never overlap the drawn
// silhouette/window - wide enough for a day-qualified timestamp (short
// month + day + hour:minute:second).
const LABEL_LANE_PX = 100;
// Comfortable pointer target for grabbing an edge handle, independent of its
// drawn width, px.
const EDGE_HIT_PX = 10;
// A right-edge drag within this many px of the live edge snaps to it exactly,
// so the caller sees to === domainEnd and can reattach live-follow.
const SNAP_PX = 6;
const PAN_STEP_FRACTION = 0.1;
const RESIZE_STEP_FRACTION = 0.1;
// Rounds the draggable window box's corners - mirrors --radius-sm (the
// small-control radius token) since SVG rect geometry attributes can't
// reference a CSS custom property directly.
const WINDOW_CORNER_RADIUS_PX = 6;

type DragMode = 'pan' | 'resize-left' | 'resize-right';

interface DragState {
  mode: DragMode;
  pointerId: number;
  startXMs: number;
  startFrom: number;
  startTo: number;
}

export function TimelineBrush({
  domainStart, domainEnd, from, to, onChange, silhouette, minWindowMs = MIN_BOX_WINDOW_MS,
  ariaLabel, ariaValueText, formatEdgeLabels, height = TIMELINE_BRUSH_DEFAULT_HEIGHT, className,
}: TimelineBrushProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const dragRef = useRef<DragState | null>(null);
  // The last reported [from, to] during an active drag - the pointer-up
  // handler reports this back with phase 'end' instead of recomputing from a
  // possibly-stale event.
  const latestRef = useRef<[number, number]>([from, to]);
  // Drives the ew-resize cursor affordance BEFORE a click: which zone the
  // pointer is hovering (tracked only while not dragging) or actively
  // dragging (the mode pins the cursor for the whole gesture, independent of
  // exactly where the pointer sits mid-drag).
  const [hoverZone, setHoverZone] = useState<BrushHitZone | null>(null);
  const [activeMode, setActiveMode] = useState<DragMode | null>(null);

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

  // The drawable track is inset by the label lanes on each side; the block
  // itself (background, rounded corners) still spans the full width.
  const trackW = Math.max(1, width - LABEL_LANE_PX * 2);
  const tPx = (t: number) => LABEL_LANE_PX + msToPx(t, domainStart, domainEnd, trackW);
  const pxT = (x: number) => pxToMs(x - LABEL_LANE_PX, domainStart, domainEnd, trackW);

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
    const fromPx = tPx(from);
    const toPx = tPx(to);
    const zone = hitZoneAt(x, fromPx, toPx, EDGE_HIT_PX);
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();

    if (zone === 'track') {
      const windowMs = to - from;
      const centerT = pxT(x);
      const [f, t] = clampWindow(centerT - windowMs / 2, centerT + windowMs / 2, domainStart, domainEnd, minWindowMs);
      dragRef.current = { mode: 'pan', pointerId: e.pointerId, startXMs: pxT(x), startFrom: f, startTo: t };
      setActiveMode('pan');
      report(f, t, 'drag');
      return;
    }

    const mode: DragMode = zone === 'left-edge' ? 'resize-left' : zone === 'right-edge' ? 'resize-right' : 'pan';
    dragRef.current = { mode, pointerId: e.pointerId, startXMs: pxT(x), startFrom: from, startTo: to };
    setActiveMode(mode);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId || width <= 0) {
      // Not the active drag (or no drag at all) - just track which zone the
      // pointer is over so the ew-resize affordance applies before a click.
      if (!d && width > 0) {
        const x = localX(e);
        setHoverZone(hitZoneAt(x, tPx(from), tPx(to), EDGE_HIT_PX));
      }
      return;
    }
    const x = localX(e);
    const nowMs = pxT(x);
    const deltaMs = nowMs - d.startXMs;

    if (d.mode === 'pan') {
      const [f, t] = panWindow(d.startFrom, d.startTo, deltaMs, domainStart, domainEnd);
      report(f, t, 'drag');
    } else if (d.mode === 'resize-left') {
      const f = resizeLeftEdge(d.startTo, d.startFrom + deltaMs, domainStart, minWindowMs);
      report(f, d.startTo, 'drag');
    } else {
      const domainEndPx = tPx(domainEnd);
      const candidatePx = snapToEnd(tPx(d.startTo) + (x - tPx(d.startXMs)), domainEndPx, SNAP_PX);
      const t = resizeRightEdge(d.startFrom, pxT(candidatePx), domainEnd, minWindowMs);
      report(d.startFrom, t, 'drag');
    }
  };

  const onPointerLeave = () => setHoverZone(null);

  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    if (e.currentTarget.hasPointerCapture(d.pointerId)) e.currentTarget.releasePointerCapture(d.pointerId);
    dragRef.current = null;
    setActiveMode(null);
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

  const fromPx = width > 0 ? tPx(from) : 0;
  const toPx = width > 0 ? tPx(to) : 0;

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
    return buildSilhouettePathD(silhouette, tPx, toY, bottom);
  })();

  // Edge zones (hover or active drag) win over the box/track for the cursor,
  // matching hitZoneAt's own precedence.
  const isEdgeCursor = activeMode
    ? activeMode !== 'pan'
    : hoverZone === 'left-edge' || hoverZone === 'right-edge';

  const [startLabel, endLabel] = formatEdgeLabels ? formatEdgeLabels(domainStart, domainEnd) : [null, null];

  return (
    <div
      ref={wrapRef}
      className={`${styles.root} ${className ?? ''}`}
      style={{ height, cursor: isEdgeCursor ? 'ew-resize' : undefined }}
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
      onPointerLeave={onPointerLeave}
    >
      <svg className={styles.svg} width={width} height={height} viewBox={`0 0 ${Math.max(1, width)} ${height}`} preserveAspectRatio="none">
        <rect className={styles.track} x={0} y={0} width={Math.max(1, width)} height={height} />
        {silhouettePath && <path className={styles.silhouette} d={silhouettePath} />}
        <rect
          className={styles.window}
          x={fromPx}
          y={0}
          width={Math.max(1, toPx - fromPx)}
          height={height}
          rx={WINDOW_CORNER_RADIUS_PX}
          ry={WINDOW_CORNER_RADIUS_PX}
        />
        <rect className={styles.edge} x={fromPx - 1} y={0} width={2} height={height} />
        <rect className={styles.edge} x={toPx - 1} y={0} width={2} height={height} />
      </svg>
      {formatEdgeLabels && width > 0 && (
        <>
          <span className={`${styles.edgeLabel} ${styles.edgeLabelStart}`}>{startLabel}</span>
          <span className={`${styles.edgeLabel} ${styles.edgeLabelEnd}`}>{endLabel}</span>
        </>
      )}
    </div>
  );
}
