import { ImmersiveLayout } from '../common/ImmersiveLayout';
import type { WidgetProps } from '../types';
import { ProcessesWidget } from './ProcessesWidget';
import styles from './ProcessesTouch.module.scss';

/**
 * Immersive view: one cell that fills the whole page (ImmersiveLayout grows
 * the last cell by default), so the list gets the panel's full height. This is
 * the only surface that scrolls - the tile clips to whole rows instead.
 */
export function ProcessesTouch({ widget, surface, deviceTouch, immersiveGrid }: WidgetProps) {
  return (
    <ImmersiveLayout
      cells={[
        <div className={styles.cell} key="processes">
          <ProcessesWidget widget={widget} surface={surface} deviceTouch={deviceTouch} immersive />
        </div>,
      ]}
      gridColumns={immersiveGrid?.columns ?? 4}
      gridRows={immersiveGrid?.rows ?? 8}
    />
  );
}

export default ProcessesTouch;
