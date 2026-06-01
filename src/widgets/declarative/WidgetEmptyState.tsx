// Universal empty / loading state: centered pulsing icon + optional one-liner.
// Rendered by DeclarativeWidget before the first data value, or when the widget
// publishes an _emptyState shape. Sizes via its container (`container-type:
// size`), proportionate at 2x2 / 4x2 / 4x4 without per-size overrides.

import styles from './WidgetEmptyState.module.scss';

export interface WidgetEmptyStateProps {
  iconUrl?: string | null;
  /** Widget display name. Shown on 4x2+ when no `primary` is supplied. */
  name?: string;
  /** Headline (e.g. "Loading…", "Location unknown"). */
  primary?: string;
  /** Optional second line for actionable hints. */
  secondary?: string;
  /** Disable the breathing pulse — for non-loading empty states. */
  staticIcon?: boolean;
}

export function WidgetEmptyState({
  iconUrl, name, primary, secondary, staticIcon,
}: WidgetEmptyStateProps) {
  return (
    <div className={styles.shell}>
      <div className={staticIcon ? styles.iconStill : styles.icon} aria-hidden="true">
        {iconUrl ? (
          <img src={iconUrl} alt="" className={styles.iconImg} />
        ) : (
          // Fallback dot when the manifest shipped no icon; keeps the layout
          // from collapsing.
          <div className={styles.iconStub} />
        )}
      </div>
      {(primary || name) && (
        <div className={styles.primary}>{primary ?? name}</div>
      )}
      {secondary && (
        <div className={styles.secondary}>{secondary}</div>
      )}
    </div>
  );
}
