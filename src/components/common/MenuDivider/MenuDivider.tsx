import styles from './MenuDivider.module.scss';

/**
 * Thin rule separating groups of rows in a dropdown or menu popover. Matches
 * the divider shape Select's option groups and WidgetContextMenu already
 * draw locally.
 */
export function MenuDivider() {
  return <div className={styles.divider} role="separator" />;
}
