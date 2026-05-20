import styles from './CapacityBar.module.scss';

interface CapacityBarProps {
  /** Total capacity in any unit - all values must use the same unit. */
  total: number;
  /** Amount highlighted in accent color (e.g. model footprint). */
  accent: number;
  /** Amount shown in muted color before the accent segment (e.g. other OS usage). */
  other?: number;
}

/**
 * Three-segment capacity bar:
 *   [other usage (muted)] [accent usage (accent)] [available (track bg)]
 *
 * All segments are proportional to total. When total is 0 the bar renders empty.
 */
export function CapacityBar({ total, accent, other = 0 }: CapacityBarProps) {
  if (total <= 0) return <div className={styles.track} />;

  const clamp = (v: number) => Math.max(0, Math.min(1, v / total));
  const otherPct = clamp(other) * 100;
  const accentPct = Math.min(clamp(accent) * 100, 100 - otherPct);

  return (
    <div className={styles.track} role="meter" aria-valuemin={0} aria-valuenow={accent} aria-valuemax={total}>
      {otherPct > 0 && (
        <div className={styles.segOther} style={{ width: `${otherPct}%` }} />
      )}
      {accentPct > 0 && (
        <div className={styles.segAccent} style={{ width: `${accentPct}%` }} />
      )}
    </div>
  );
}
