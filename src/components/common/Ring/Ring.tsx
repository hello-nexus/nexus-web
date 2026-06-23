import type { ReactNode } from 'react';
import styles from './Ring.module.scss';

export interface RingProps {
  value: number;
  min?: number;
  max?: number;
  label?: string;
  sublabel?: string;
  color?: string;
  thickness?: number;
  children?: ReactNode;
}

export function Ring({ value, min = 0, max = 100, label, sublabel, color = 'var(--accent, currentColor)', thickness = 8, children }: RingProps) {
  const hi = max - min || 1;
  const fill = Math.max(0, Math.min(1, (value - min) / hi));
  const size = 72;
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className={styles.root}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border, rgba(255,255,255,0.12))" strokeWidth={thickness} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={thickness}
          strokeDasharray={c} strokeDashoffset={c * (1 - fill)} strokeLinecap="round" />
      </svg>
      <div className={styles.center}>
        {children}
        {label != null && <span className={styles.label}>{label}</span>}
        {sublabel != null && <span className={styles.sublabel}>{sublabel}</span>}
      </div>
    </div>
  );
}
