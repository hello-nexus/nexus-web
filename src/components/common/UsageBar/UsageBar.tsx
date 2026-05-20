import styles from './UsageBar.module.scss';

interface UsageBarProps {
  /** Fraction in [0, 1]. Clamped - never exceeds the track. */
  value: number;
  /** Override the fill color. Defaults to var(--accent). */
  color?: string;
}

export function UsageBar({ value, color }: UsageBarProps) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className={styles.track}>
      {pct > 0 && (
        <div
          className={styles.fill}
          style={{ width: `${pct}%`, ...(color ? { background: color } : {}) }}
        />
      )}
    </div>
  );
}
