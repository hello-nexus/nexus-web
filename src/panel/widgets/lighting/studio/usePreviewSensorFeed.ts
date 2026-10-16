import { useEffect } from 'react';
import { useSensorSignal } from '../../../../hooks/useSensorSignal';
import { setPreviewSensorFeed } from './recipePreview';

let users = 0;

/** While `enabled`, the gallery previews read live sensor readings instead of swinging on their own. */
export function usePreviewSensorFeed(enabled: boolean): void {
  const ref = useSensorSignal(enabled);
  useEffect(() => {
    if (!enabled) return;
    users += 1;
    setPreviewSensorFeed(ref);
    return () => {
      users -= 1;
      if (users === 0) setPreviewSensorFeed(null);
    };
  }, [enabled, ref]);
}
