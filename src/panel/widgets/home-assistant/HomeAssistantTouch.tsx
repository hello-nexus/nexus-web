import type { ReactNode } from 'react';
import { ImmersiveLayout } from '../common/ImmersiveLayout';
import { useHomeAssistant, HomeAssistantSetupForm, HomeAssistantEntityList } from './HomeAssistantPage';
import type { WidgetProps } from '../types';

export function HomeAssistantTouch({ immersiveGrid }: WidgetProps) {
  const ctrl = useHomeAssistant();

  const cells: ReactNode[] = ctrl.showSetup
    ? [<HomeAssistantSetupForm ctrl={ctrl} immersive />]
    : [<HomeAssistantEntityList ctrl={ctrl} immersive />];

  return (
    <ImmersiveLayout
      cells={cells}
      gridColumns={immersiveGrid?.columns ?? 4}
      gridRows={immersiveGrid?.rows ?? 8}
    />
  );
}

export default HomeAssistantTouch;
