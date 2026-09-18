import { GaugeValue } from './GaugeValue';
import type { GaugeProps } from './types';
import type { GaugeGradient } from '../valueColor';
import { gaugeGradientColorAt } from '../../../theme/gaugeGradient';
import styles from './WedgeGauge.module.scss';

const RADIUS = 36;
const CX = 50;
const CY = 50;

function polar(angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: CX + RADIUS * Math.cos(rad), y: CY + RADIUS * Math.sin(rad) };
}

// Pie slice path that fills clockwise from 12 o'clock. At 100% the slice
// closes into a full filled circle.
function wedgePath(percent: number): string {
  if (percent <= 0) return '';
  if (percent >= 100) {
    // Two half-arc circles to avoid the M-A-Z degeneracy when end == start.
    const top = polar(-90);
    const bottom = polar(90);
    return `M ${top.x.toFixed(3)} ${top.y.toFixed(3)} A ${RADIUS} ${RADIUS} 0 0 1 ${bottom.x.toFixed(3)} ${bottom.y.toFixed(3)} A ${RADIUS} ${RADIUS} 0 0 1 ${top.x.toFixed(3)} ${top.y.toFixed(3)} Z`;
  }
  const startAngle = -90;
  const endAngle = startAngle + (percent / 100) * 360;
  const start = polar(startAngle);
  const end = polar(endAngle);
  const largeArc = percent > 50 ? 1 : 0;
  return `M ${CX} ${CY} L ${start.x.toFixed(3)} ${start.y.toFixed(3)} A ${RADIUS} ${RADIUS} 0 ${largeArc} 1 ${end.x.toFixed(3)} ${end.y.toFixed(3)} Z`;
}

// A graded wedge is this many sectors from 12 o'clock, each the gradient's
// colour at its own angle; the last one is cut at the reading. Filled shapes
// need no reveal mask, unlike the stroked arcs.
const SECTORS = 48;

function sectorPath(fromDeg: number, toDeg: number): string {
  const start = polar(fromDeg);
  const end = polar(toDeg);
  const largeArc = toDeg - fromDeg > 180 ? 1 : 0;
  return `M ${CX} ${CY} L ${start.x.toFixed(3)} ${start.y.toFixed(3)} A ${RADIUS} ${RADIUS} 0 ${largeArc} 1 ${end.x.toFixed(3)} ${end.y.toFixed(3)} Z`;
}

function gradedSectors(percent: number, stops: GaugeGradient['stops']) {
  const endDeg = -90 + (percent / 100) * 360;
  const step = 360 / SECTORS;
  const sectors: { d: string; color: string }[] = [];
  for (let i = 0; i < SECTORS; i++) {
    const from = -90 + i * step;
    if (from >= endDeg) break;
    // Overdraw into the next sector so antialiased seams never show.
    const to = Math.min(endDeg, from + step * 1.5);
    sectors.push({ d: sectorPath(from, to), color: gaugeGradientColorAt(stops, (i + 0.5) / SECTORS) });
  }
  return sectors;
}

export function WedgeGauge({ value, formatted, label, gradient }: GaugeProps) {
  const clamped = Math.max(0, Math.min(100, value));

  return (
    <div className={styles.wedge}>
      <div className={styles.chartWrap}>
        <svg className={styles.svg} viewBox="0 0 100 100">
          <circle cx={CX} cy={CY} r={RADIUS} className={styles.track} />
          {clamped > 0 && (gradient
            ? gradedSectors(clamped, gradient.stops).map((sector, i) => <path key={i} d={sector.d} fill={sector.color} />)
            : <path d={wedgePath(clamped)} className={styles.fill} />)}
        </svg>
      </div>
      <div className={styles.info}>
        <GaugeValue formatted={formatted} className={styles.value} />
        {label && <span className={styles.label}>{label}</span>}
      </div>
    </div>
  );
}

export default WedgeGauge;
