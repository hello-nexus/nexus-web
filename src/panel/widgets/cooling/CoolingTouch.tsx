import type { ReactNode } from 'react';
import { ImmersiveLayout } from '../common/ImmersiveLayout';
import { CoolingImmersiveModes } from './touch/CoolingImmersiveModes';
import { CoolingImmersiveFans } from './touch/CoolingImmersiveFans';
import { useCoolingImmersive } from './touch/useCoolingImmersive';
import type { WidgetProps } from '../types';

/**
 * Fullscreen cooling controller - the desktop cooling page's simple mode on
 * a touch panel. Two cells (stacked in portrait, side by side in landscape):
 *  - Cell 1: the Silent / Balanced / Turbo / Off tiles over the Nexus
 *    Control summary and its "Control all" action.
 *  - Cell 2 (the fill cell): the live thermals trend chart over a read-only
 *    readout of every connected fan. Curves, per-fan modes and calibration
 *    stay on the desktop page's advanced mode.
 * Both cells resync via the 'cooling' multiplex topic.
 */
export function CoolingTouch({ immersiveGrid }: WidgetProps) {
  const cooling = useCoolingImmersive();

  const cells: ReactNode[] = [
    <CoolingImmersiveModes cooling={cooling} />,
    <CoolingImmersiveFans cooling={cooling} />,
  ];

  return (
    <ImmersiveLayout
      cells={cells}
      gridColumns={immersiveGrid?.columns ?? 4}
      gridRows={immersiveGrid?.rows ?? 8}
    />
  );
}
