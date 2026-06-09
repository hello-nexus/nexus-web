// Self-contained draggable curve editor (the SDK's `ui-curve`). A cooling app
// builds a fan curve with it; any app can edit an X/Y point set. It mirrors the
// native cooling CurveGraph's affordances (drag a point to move it, double-click
// empty space to add, right-click a point to remove) and uses the same visual
// tokens (accent gradient area + accent-glow line + faint grid) so it reads as a
// native graph — but it is independent of the cooling-page styles/types, so it
// stays a blessed primitive without coupling the host to cooling internals.
//
// The worker owns the data: it passes `points` ([{x,y}]) + axis ranges and gets
// the new array back via `change`. During an active drag the host keeps a local
// optimistic copy so the dragged point tracks the cursor 1:1; `change` fires on
// every move (live preview for the worker) and the local copy is dropped on
// release, by which point the round-tripped props have caught up (no flicker).

import { useRef, useState } from 'react';
import type { HostProps } from './components';
import { toneVar } from './tokens';

interface Pt { x: number; y: number }

const fin = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

function parsePoints(raw: unknown): Pt[] {
  if (!Array.isArray(raw)) return [];
  const out: Pt[] = [];
  for (const item of raw) {
    const o = item as { x?: unknown; y?: unknown };
    const x = fin(o?.x); const y = fin(o?.y);
    if (x !== undefined && y !== undefined) out.push({ x, y });
  }
  return out;
}

const VIEW_W = 100, VIEW_H = 56, PAD = 4;

export function CurveHost(p: HostProps) {
  const xmin = fin(p.xmin) ?? 0, xmax = fin(p.xmax) ?? 100;
  const ymin = fin(p.ymin) ?? 0, ymax = fin(p.ymax) ?? 100;
  const xspan = xmax - xmin || 1, yspan = ymax - ymin || 1;
  const color = toneVar(typeof p.tone === 'string' ? p.tone : undefined, 'var(--accent, #6c8cff)');
  const svgRef = useRef<SVGSVGElement>(null);
  // Local optimistic points during a drag; null when not dragging (props own it).
  const [drag, setDrag] = useState<{ idx: number; pts: Pt[] } | null>(null);

  const propPts = parsePoints(p.points);
  const pts = (drag ? drag.pts : propPts).slice().sort((a, b) => a.x - b.x);

  const innerW = VIEW_W - PAD * 2, innerH = VIEW_H - PAD * 2;
  const toX = (x: number) => PAD + ((x - xmin) / xspan) * innerW;
  const toY = (y: number) => PAD + innerH - ((y - ymin) / yspan) * innerH;
  const fromX = (px: number) => xmin + ((px - PAD) / innerW) * xspan;
  const fromY = (py: number) => ymin + (1 - (py - PAD) / innerH) * yspan;

  const svgPoint = (e: { clientX: number; clientY: number }): { x: number; y: number } | null => {
    const el = svgRef.current; if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * VIEW_W, y: ((e.clientY - r.top) / r.height) * VIEW_H };
  };
  // preview = continuous during a drag (live, cheap); change = a commit (release,
  // add, remove) so a consumer can persist/dispatch only on commit, like ui-slider.
  const emit = (ev: 'preview' | 'change', next: Pt[]) => p.__events?.[ev]?.(next.map((q) => ({ x: q.x, y: q.y })));

  const onPtrDown = (idx: number, e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    setDrag({ idx, pts });
  };
  const onPtrMove = (e: React.PointerEvent) => {
    if (!drag) return;
    const sp = svgPoint(e); if (!sp) return;
    // Clamp the dragged point inside the axes and between its neighbours' x.
    const sorted = drag.pts.slice().sort((a, b) => a.x - b.x);
    const i = drag.idx;
    const lo = i > 0 ? sorted[i - 1].x : xmin;
    const hi = i < sorted.length - 1 ? sorted[i + 1].x : xmax;
    const nx = Math.max(lo, Math.min(hi, fromX(sp.x)));
    const ny = Math.max(ymin, Math.min(ymax, fromY(sp.y)));
    const nextSorted = sorted.slice(); nextSorted[i] = { x: nx, y: ny };
    setDrag({ idx: i, pts: nextSorted });
    emit('preview', nextSorted);
  };
  const onPtrUp = () => { if (drag) { emit('change', drag.pts.slice().sort((a, b) => a.x - b.x)); setDrag(null); } };
  const onDblClick = (e: React.MouseEvent) => {
    const sp = svgPoint(e); if (!sp) return;
    const np = { x: Math.max(xmin, Math.min(xmax, fromX(sp.x))), y: Math.max(ymin, Math.min(ymax, fromY(sp.y))) };
    emit('change', [...pts, np].sort((a, b) => a.x - b.x));
  };
  const onCtx = (idx: number, e: React.MouseEvent) => {
    e.preventDefault();
    if (pts.length > 2) emit('change', pts.filter((_, i) => i !== idx));
  };

  const line = pts.map((q, i) => `${i === 0 ? 'M' : 'L'} ${toX(q.x)} ${toY(q.y)}`).join(' ');
  const area = pts.length ? `${line} L ${toX(pts[pts.length - 1].x)} ${toY(ymin)} L ${toX(pts[0].x)} ${toY(ymin)} Z` : '';
  const gridY = [0, 0.25, 0.5, 0.75, 1].map((f) => PAD + f * innerH);
  const gradId = 'sdkCurveGrad';

  return (
    <svg
      ref={svgRef} viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} preserveAspectRatio="none"
      style={{ width: '100%', height: '100%', minHeight: 80, touchAction: 'none', display: 'block' }}
      role="img" aria-label="curve editor"
      onPointerMove={onPtrMove} onPointerUp={onPtrUp} onDoubleClick={onDblClick}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.35} />
          <stop offset="100%" stopColor={color} stopOpacity={0.02} />
        </linearGradient>
      </defs>
      {gridY.map((y, i) => (
        <line key={i} x1={PAD} y1={y} x2={VIEW_W - PAD} y2={y}
          stroke="var(--border, rgba(255,255,255,0.10))" strokeWidth={0.4} vectorEffect="non-scaling-stroke" />
      ))}
      {area && <path d={area} fill={`url(#${gradId})`} />}
      {line && <path d={line} fill="none" stroke={color} strokeWidth={1.6} vectorEffect="non-scaling-stroke" />}
      {pts.map((q, i) => (
        <circle
          key={i} cx={toX(q.x)} cy={toY(q.y)} r={drag?.idx === i ? 3 : 2.3}
          fill={color} stroke="var(--bg-card, #1a1a1a)" strokeWidth={0.6}
          style={{ cursor: 'grab' }}
          onPointerDown={(e) => onPtrDown(i, e)} onContextMenu={(e) => onCtx(i, e)}
        />
      ))}
    </svg>
  );
}
