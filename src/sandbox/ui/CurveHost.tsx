// The SDK's `ui-curve` element: a draggable X/Y point-curve editor. A cooling
// app builds a fan curve with it; any app can edit a point set. The drag / add /
// remove behaviour and the accent-themed rendering live in the shared
// CurveGraphEditor primitive — this host only adapts the SDK's HostProps
// (worker-owned `points` + `__events`) to that component, staying independent of
// any cooling-page coupling.

import type { HostProps } from './components';
import { toneVar } from './tokens';
import { CurveGraphEditor, type CurveGraphPoint } from '../../components/common/CurveGraphEditor/CurveGraphEditor';

const fin = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

function parsePoints(raw: unknown): CurveGraphPoint[] {
  if (!Array.isArray(raw)) return [];
  const out: CurveGraphPoint[] = [];
  for (const item of raw) {
    const o = item as { x?: unknown; y?: unknown };
    const x = fin(o?.x); const y = fin(o?.y);
    if (x !== undefined && y !== undefined) out.push({ x, y });
  }
  return out;
}

export function CurveHost(p: HostProps) {
  const xmin = fin(p.xmin) ?? 0, xmax = fin(p.xmax) ?? 100;
  const ymin = fin(p.ymin) ?? 0, ymax = fin(p.ymax) ?? 100;
  const color = toneVar(typeof p.tone === 'string' ? p.tone : undefined, 'var(--accent, #2563eb)');
  // preview = continuous during a drag (live, cheap); change = a commit (release,
  // add, remove) so a consumer can persist/dispatch only on commit, like ui-slider.
  const emit = (ev: 'preview' | 'change', next: CurveGraphPoint[]) =>
    p.__events?.[ev]?.(next.map((q) => ({ x: q.x, y: q.y })));

  return (
    <CurveGraphEditor
      points={parsePoints(p.points)}
      xMin={xmin} xMax={xmax} yMin={ymin} yMax={ymax}
      color={color}
      onPreview={(pts) => emit('preview', pts)}
      onChange={(pts) => emit('change', pts)}
    />
  );
}
