import { useEffect } from 'react';
import { useSensorSignal } from '../../../../hooks/useSensorSignal';
import { setPreviewSensorFeed } from './recipePreview';

let users = 0;

/** While mounted, the gallery previews read live sensor readings instead of swinging on their own. Renders nothing. */
export function PreviewSensorFeed() {
  const ref = useSensorSignal(true);
  useEffect(() => {
    users += 1;
    setPreviewSensorFeed(ref);
    return () => {
      users -= 1;
      if (users === 0) setPreviewSensorFeed(null);
    };
  }, [ref]);
  return null;
}
