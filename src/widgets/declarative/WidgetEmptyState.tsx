// Universal empty / loading state for declarative widgets. Centered
// pulsing widget icon + optional one-liner. Rendered by DeclarativeWidget
// when no data source has produced its first value yet, or when the
// widget explicitly published an _emptyState shape.
//
// The component reads its dimensions from the surrounding container
// (DeclarativeWidget wraps every widget in `container-type: size`), so
// the same component looks proportionate at 2x2 / 4x2 / 4x4 without
// per-size manifest overrides.

import styles from './WidgetEmptyState.module.scss';

export interface WidgetEmptyStateProps {
  iconUrl?: string | null;
  /** Widget display name. Shown only on 4x2 and larger when no `primary`
   *  is supplied — gives the user a hint about which card is loading. */
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
          // Fallback glyph when the manifest didn't ship an icon. A subtle
          // dot keeps the layout from collapsing.
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
