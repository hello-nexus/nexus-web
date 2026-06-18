// Draggable X/Y point-curve graph. Drag a point to move it (clamped inside the
// axes and between its neighbours' x); when `allowAddRemove` is set, double-click
// empty space to add a point and right-click a point to remove it. Uses the
// accent gradient area + accent-glow line + faint grid tokens so it reads as a
// native graph. Display-only callers pass `allowAddRemove={false}` for a fixed
// point set (the HYTE firmware curve, which holds exactly N points).
//
// Owner owns the data: it passes `points` ([{x,y}]) + axis ranges and gets the
// new array back via `onChange`. During a drag a local optimistic copy tracks the
// cursor 1:1; `onPreview` fires every move (live preview) and is dropped on
// release, by which point `onChange` + the round-tripped props have caught up.

import { useId, useRef, useState } from 'react';

export interface CurveGraphPoint {
  x: number;
  y: number;
}

export interface CurveGraphEditorProps {
  points: CurveGraphPoint[];
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  /** Commit: fires on release, add, and remove. */
  onChange: (points: CurveGraphPoint[]) => void;
  /** Continuous: fires on every drag move for a live preview. Optional. */
  onPreview?: (points: CurveGraphPoint[]) => void;
  /** Double-click adds a point, right-click removes one. Default true. */
  allowAddRemove?: boolean;
  /** Floor on point count when removing. Default 2. */
  minPoints?: number;
  /** Line / area / handle colour. Default the accent token. */
  color?: string;
  ariaLabel?: string;
  className?: string;
}

const VIEW_W = 100, VIEW_H = 56, PAD = 4;

export function CurveGraphEditor({
  points, xMin, xMax, yMin, yMax,
  onChange, onPreview, allowAddRemove = true, minPoints = 2,
  color = 'var(--accent, #2563eb)', ariaLabel = 'curve editor', className,
}: CurveGraphEditorProps) {
  const xspan = xMax - xMin || 1, yspan = yMax - yMin || 1;
  const svgRef = useRef<SVGSVGElement>(null);
  // Unique per instance: two editors co-mount on the Q-series page, and a shared
  // gradient id would make url(#…) resolve to the first match in document order.
  const gradId = useId();
  // Local optimistic points during a drag; null when not dragging (props own it).
  const [drag, setDrag] = useState<{ idx: number; pts: CurveGraphPoint[] } | null>(null);

  const pts = (drag ? drag.pts : points).slice().sort((a, b) => a.x - b.x);

  const innerW = VIEW_W - PAD * 2, innerH = VIEW_H - PAD * 2;
  const toX = (x: number) => PAD + ((x - xMin) / xspan) * innerW;
  const toY = (y: number) => PAD + innerH - ((y - yMin) / yspan) * innerH;
  const fromX = (px: number) => xMin + ((px - PAD) / innerW) * xspan;
  const fromY = (py: number) => yMin + (1 - (py - PAD) / innerH) * yspan;

  const svgPoint = (e: { clientX: number; clientY: number }): { x: number; y: number } | null => {
    const el = svgRef.current; if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * VIEW_W, y: ((e.clientY - r.top) / r.height) * VIEW_H };
  };

  const onPtrDown = (idx: number, e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    setDrag({ idx, pts });
  };
  const onPtrMove = (e: React.PointerEvent) => {
    if (!drag) return;
    const sp = svgPoint(e); if (!sp) return;
    const sorted = drag.pts.slice().sort((a, b) => a.x - b.x);
    const i = drag.idx;
    const lo = i > 0 ? sorted[i - 1].x : xMin;
    const hi = i < sorted.length - 1 ? sorted[i + 1].x : xMax;
    const nx = Math.max(lo, Math.min(hi, fromX(sp.x)));
    const ny = Math.max(yMin, Math.min(yMax, fromY(sp.y)));
    const nextSorted = sorted.slice(); nextSorted[i] = { x: nx, y: ny };
    setDrag({ idx: i, pts: nextSorted });
    onPreview?.(nextSorted);
  };
  const onPtrUp = () => { if (drag) { onChange(drag.pts.slice().sort((a, b) => a.x - b.x)); setDrag(null); } };
  const onDblClick = (e: React.MouseEvent) => {
    if (!allowAddRemove) return;
    const sp = svgPoint(e); if (!sp) return;
    const np = { x: Math.max(xMin, Math.min(xMax, fromX(sp.x))), y: Math.max(yMin, Math.min(yMax, fromY(sp.y))) };
    onChange([...pts, np].sort((a, b) => a.x - b.x));
  };
  const onCtx = (idx: number, e: React.MouseEvent) => {
    if (!allowAddRemove) return;
    e.preventDefault();
    if (pts.length > minPoints) onChange(pts.filter((_, i) => i !== idx));
  };

  const line = pts.map((q, i) => `${i === 0 ? 'M' : 'L'} ${toX(q.x)} ${toY(q.y)}`).join(' ');
  const area = pts.length ? `${line} L ${toX(pts[pts.length - 1].x)} ${toY(yMin)} L ${toX(pts[0].x)} ${toY(yMin)} Z` : '';
  const gridY = [0, 0.25, 0.5, 0.75, 1].map((f) => PAD + f * innerH);
  const gridX = [0, 0.25, 0.5, 0.75, 1].map((f) => PAD + f * innerW);

  return (
    <svg
      ref={svgRef} viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} preserveAspectRatio="none"
      className={className}
      style={{ width: '100%', height: '100%', minHeight: 80, touchAction: 'none', display: 'block' }}
      role="img" aria-label={ariaLabel}
      onPointerMove={onPtrMove} onPointerUp={onPtrUp} onDoubleClick={onDblClick}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.35} />
          <stop offset="100%" stopColor={color} stopOpacity={0.02} />
        </linearGradient>
      </defs>
      {gridX.map((x, i) => (
        <line key={`x${i}`} x1={x} y1={PAD} x2={x} y2={VIEW_H - PAD}
          stroke="var(--border, rgba(255,255,255,0.10))" strokeWidth={0.4} vectorEffect="non-scaling-stroke" />
      ))}
      {gridY.map((y, i) => (
        <line key={`y${i}`} x1={PAD} y1={y} x2={VIEW_W - PAD} y2={y}
          stroke="var(--border, rgba(255,255,255,0.10))" strokeWidth={0.4} vectorEffect="non-scaling-stroke" />
      ))}
      {area && <path d={area} fill={`url(#${gradId})`} />}
      {line && <path d={line} fill="none" stroke={color} strokeWidth={1.6} vectorEffect="non-scaling-stroke" />}
      {pts.map((q, i) => (
        <circle
          key={i} cx={toX(q.x)} cy={toY(q.y)} r={drag?.idx === i ? 3 : 2.3}
          fill={color} stroke="var(--surface, #0d0d0d)" strokeWidth={0.6}
          style={{ cursor: 'grab' }}
          onPointerDown={(e) => onPtrDown(i, e)} onContextMenu={(e) => onCtx(i, e)}
        />
      ))}
    </svg>
  );
}
