import type { CSSProperties } from 'react';
import styles from './RangeBar.module.scss';

const GRADIENT: Record<string, string> = {
  temp: 'linear-gradient(90deg, #38bdf8, var(--accent-glow, #67e8f9), #fbbf24)',
  accent: 'linear-gradient(90deg, var(--accent-deep, #22d3ee), var(--accent-glow, #67e8f9))',
};

export interface RangeBarProps {
  lo: number;
  hi: number;
  min?: number;
  max?: number;
  gradient?: 'temp' | 'accent';
  glow?: boolean;
  height?: number;
  radius?: number;
}

export function RangeBar({ lo, hi, min = 0, max = 1, gradient = 'temp', glow = false, height = 5, radius = 999 }: RangeBarProps) {
  const span = max - min || 1;
  const left = Math.max(0, Math.min(1, (lo - min) / span));
  const right = Math.max(0, Math.min(1, (hi - min) / span));
  const width = Math.max(0.04, right - left);
  const grad = GRADIENT[gradient] ?? GRADIENT.temp;
  return (
    <div
      className={styles.track}
      style={{ '--rb-height': `${height}px`, '--rb-radius': `${radius}px` } as CSSProperties}
    >
      <div
        className={styles.fill}
        style={{
          left: `${left * 100}%`,
          width: `${width * 100}%`,
          background: grad,
          boxShadow: glow ? '0 0 6px var(--accent-glow, rgba(103,232,249,0.55))' : undefined,
        } as CSSProperties}
      />
    </div>
  );
}
