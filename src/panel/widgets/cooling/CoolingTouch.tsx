import type { ReactNode } from 'react';
import { ImmersiveLayout } from '../common/ImmersiveLayout';
import { CoolingImmersiveStatus } from './touch/CoolingImmersiveStatus';
import { CoolingImmersiveEditor } from './touch/CoolingImmersiveEditor';
import { useCoolingImmersive } from './touch/useCoolingImmersive';
import type { WidgetProps } from '../types';

/**
 * Fullscreen cooling controller. Two cells (stacked in portrait, side by
 * side in landscape):
 *  - Cell 1: preset mode buttons (off / silent / balanced / turbo / custom)
 *    over the live thermals trend chart.
 *  - Cell 2 (the fill cell): the desktop cooling page's layout - the pinned
 *    hero CurveCard with the curve-selector chips, over the fan list with
 *    its collapsible hub groups - minus the wire layer and calibration flow.
 *    Both cells resync via the 'cooling' multiplex topic.
 */
export function CoolingTouch({ immersiveGrid }: WidgetProps) {
  const cooling = useCoolingImmersive();

  const cells: ReactNode[] = [
    <CoolingImmersiveStatus cooling={cooling} />,
    <CoolingImmersiveEditor cooling={cooling} />,
  ];

  return (
    <ImmersiveLayout
      cells={cells}
      gridColumns={immersiveGrid?.columns ?? 4}
      gridRows={immersiveGrid?.rows ?? 8}
    />
  );
}
