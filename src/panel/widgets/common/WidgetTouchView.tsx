import { useMemo } from 'react';
import type { ComponentType } from 'react';
import type { WidgetProps } from '../types';
import { ImmersiveLayout } from './ImmersiveLayout';
import styles from './WidgetTouchView.module.scss';

/**
 * Generic immersive wrapper for widgets that don't ship their own
 * custom layout. Renders the widget at size '4x4' inside a single
 * ImmersiveLayout cell so it gets centered on the immersive page in
 * portrait, fills the column in landscape.
 */
export function makeWidgetTouchView(Component: ComponentType<WidgetProps>): ComponentType<WidgetProps> {
  return function WidgetImmersiveAdapter({ widget, surface, deviceTouch, immersiveGrid, onUpdate, editorPreview }: WidgetProps) {
    const fullsize = useMemo(() => ({ ...widget, size: '4x4' as const }), [widget]);
    const cell = (
      <div className={styles.immersive}>
        {/* onUpdate rides along so a pick made fullscreen persists like one
            made on the tile - without it the gallery's arrows are inert here. */}
        <Component
          widget={fullsize}
          surface={surface}
          deviceTouch={deviceTouch}
          onUpdate={onUpdate}
          editorPreview={editorPreview}
        />
      </div>
    );
    return (
      <ImmersiveLayout
        cells={[cell]}
        gridColumns={immersiveGrid?.columns ?? 4}
        gridRows={immersiveGrid?.rows ?? 8}
      />
    );
  };
}
