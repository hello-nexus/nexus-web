import { CurveGraph } from '../../panel/widgets/cooling/page/CurveEditor';
import type { CurvePoint } from '../../api/cooling';
import type { HostProps } from './components';

const fin = (v: unknown, fb: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fb);

function toGraph(raw: unknown): CurvePoint[] {
  if (!Array.isArray(raw)) return [];
  const out: CurvePoint[] = [];
  for (const item of raw) {
    const o = item as { x?: unknown; y?: unknown };
    const x = fin(o?.x, NaN); const y = fin(o?.y, NaN);
    if (!Number.isNaN(x) && !Number.isNaN(y)) out.push({ temp: x, speed: Math.max(0, Math.min(100, y)) });
  }
  return out;
}

export function CurveHost(p: HostProps) {
  const pts = toGraph(p.points);
  const tempMin = fin(p.xmin, 0);
  const tempMax = fin(p.xmax, 100);

  const toSdk = (next: CurvePoint[]) => next.map(q => ({ x: q.temp, y: q.speed }));

  return (
    <div style={{ width: '100%', minHeight: 140 }}>
      <CurveGraph
        points={pts}
        tempMin={tempMin}
        tempMax={tempMax}
        editable
        onPreview={(next) => p.__events?.preview?.(toSdk(next))}
        onChange={(next) => p.__events?.change?.(toSdk(next))}
      />
    </div>
  );
}
