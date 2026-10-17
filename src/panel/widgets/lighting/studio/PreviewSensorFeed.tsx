import { useEffect } from 'react';
import { useSensorSignal } from '../../../../hooks/useSensorSignal';
import { registerPreviewSensorFeed } from './recipePreview';

/** While mounted, the gallery previews read live sensor readings instead of swinging on their own. Renders nothing. */
export function PreviewSensorFeed() {
  const ref = useSensorSignal(true);
  useEffect(() => registerPreviewSensorFeed(ref), [ref]);
  return null;
}
