import { Card } from '../Card/Card';
import styles from './StatTile.module.scss';

/**
 * A boxed value + label pair for a stat-tile row (Steam's per-game
 * drilldown, Frames' game detail) - a bounded Card per stat, matching the
 * benchmark results page's subsystem cards. One shared component so every
 * stat-tile grid in the app reads identically.
 */
export function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <Card compact className={styles.statTile}>
      <span className={styles.statTileValue}>{value}</span>
      <span className={styles.statTileLabel}>{label}</span>
    </Card>
  );
}
