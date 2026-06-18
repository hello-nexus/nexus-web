import type { ReactNode } from 'react';
import { ImmersiveLayout } from '../common/ImmersiveLayout';
import { SmartLightsAddColumn, SmartLightsPairedColumn, useSmartLights } from './SmartLightsPage';
import type { WidgetProps } from '../types';

/**
 * Fullscreen smart-lights management. Two cells (same shape as lighting /
 * cooling):
 *  - Cell 1 (fixed 4x4): the add-lights block (brand scan/pair + add-by-IP).
 *  - Cell 2 (the fill cell): the paired-lights list.
 * ImmersiveLayout stacks them in portrait and sits them side by side in
 * landscape, derived from the grid. State is shared with the desktop Page via
 * useSmartLights, so both views resync on the 'lighting' multiplex topic.
 */
export function SmartLightsTouch({ immersiveGrid }: WidgetProps) {
  const ctrl = useSmartLights();

  const cells: ReactNode[] = [
    <SmartLightsAddColumn ctrl={ctrl} immersive />,
    <SmartLightsPairedColumn ctrl={ctrl} immersive />,
  ];

  return (
    <ImmersiveLayout
      cells={cells}
      gridColumns={immersiveGrid?.columns ?? 4}
      gridRows={immersiveGrid?.rows ?? 8}
    />
  );
}

export default SmartLightsTouch;
