import styles from './StatTile.module.scss';

/**
 * A boxed value + label pair for a stat-tile row (Steam's per-game
 * drilldown, Frames' game detail). One shared component so every stat-tile
 * grid in the app reads identically.
 */
export function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.statTile}>
      <span className={styles.statTileValue}>{value}</span>
      <span className={styles.statTileLabel}>{label}</span>
    </div>
  );
}
