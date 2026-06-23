import { useTranslation } from '../../../lib/i18n';
import styles from './Gauge.module.scss';

export interface GaugeProps {
  value?: number;
  min?: number;
  max?: number;
  label?: string;
  sublabel?: string;
  color?: string;
}

export function Gauge({ value, min = 0, max = 100, label, sublabel, color = 'var(--accent, currentColor)' }: GaugeProps) {
  const { t } = useTranslation();
  const span = max - min || 1;
  const frac = Math.max(0, Math.min(1, ((value ?? min) - min) / span));
  const SIZE = 100, c = SIZE / 2, sw = 9, r = c - sw / 2 - 1;
  const START = 225, SWEEP = 270;
  const pt = (deg: number): [number, number] => {
    const a = (deg * Math.PI) / 180;
    return [c + r * Math.cos(a), c - r * Math.sin(a)];
  };
  const arc = (fromDeg: number, toDeg: number): string => {
    const [x0, y0] = pt(fromDeg);
    const [x1, y1] = pt(toDeg);
    const large = Math.abs(fromDeg - toDeg) > 180 ? 1 : 0;
    return `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1}`;
  };
  return (
    <div className={styles.root}>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className={styles.svg} role="img" aria-label={label ?? t('common.gauge')}>
        <path d={arc(START, START - SWEEP)} className={styles.track} strokeWidth={sw} strokeLinecap="round" />
        {frac > 0 && (
          <path d={arc(START, START - frac * SWEEP)} fill="none" strokeWidth={sw} strokeLinecap="round" stroke={color} />
        )}
        {label != null && (
          <text x={c} y={sublabel != null ? c - 4 : c} textAnchor="middle" dominantBaseline="middle"
            fill="var(--text, currentColor)" style={{ fontSize: 22, fontWeight: 600 }}>{label}</text>
        )}
        {sublabel != null && (
          <text x={c} y={c + 15} textAnchor="middle" dominantBaseline="middle"
            fill="var(--text-dim, currentColor)" style={{ fontSize: 9, letterSpacing: 0.4 }}>{sublabel}</text>
        )}
      </svg>
    </div>
  );
}
