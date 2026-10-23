import type { CSSProperties } from 'react';
import styles from '../PanelApp.module.scss';

/** The panel's solid background color, which Media mode also shows while it has nothing to display. */
export function PanelBackgroundSolid({ opacity }: { opacity: number }) {
  return (
    <div
      className={styles.backgroundSolid}
      data-panel-bg-layer
      style={{ '--panel-background-opacity': opacity } as CSSProperties}
      aria-hidden
    />
  );
}
