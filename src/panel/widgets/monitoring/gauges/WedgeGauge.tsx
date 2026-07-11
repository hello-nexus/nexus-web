import { splitFormatted } from './format';
import type { GaugeProps } from './types';
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

export function WedgeGauge({ value, formatted, label }: GaugeProps) {
  const clamped = Math.max(0, Math.min(100, value));
  const parts = splitFormatted(formatted);

  return (
    <div className={styles.wedge}>
      <div className={styles.chartWrap}>
        <svg className={styles.svg} viewBox="0 0 100 100">
          <circle cx={CX} cy={CY} r={RADIUS} className={styles.track} />
          {clamped > 0 && <path d={wedgePath(clamped)} className={styles.fill} />}
        </svg>
      </div>
      <div className={styles.info}>
        <span className={styles.value}>
          {parts.value}
          {parts.unit && <span className="panel-gauge-unit">{parts.unit}</span>}
        </span>
        {label && <span className={styles.label}>{label}</span>}
      </div>
    </div>
  );
}

export default WedgeGauge;
