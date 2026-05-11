import type { WidgetProps } from './types';
import styles from './PlaceholderWidget.module.scss';

/**
 * Renders a labelled placeholder for a widget instance. Used in Phase 1
 * before real widget components land - lets us verify layout + persistence
 * end-to-end without blocking on any individual widget's implementation.
 */
export function PlaceholderWidget({ widget }: WidgetProps) {
  return (
    <div className={styles.placeholder}>
      <div className={styles.type}>{widget.type}</div>
      <div className={styles.meta}>
        <span>{widget.size}</span>
        <span>{widget.col},{widget.row}</span>
      </div>
    </div>
  );
}
