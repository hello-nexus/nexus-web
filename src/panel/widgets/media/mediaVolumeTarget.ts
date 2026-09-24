import type { PanelWidget } from '../../types';
import type { VolumeTargetQuery } from '../../../hooks/useSystemVolume';

export type MediaVolumeMode = VolumeTargetQuery['mode'];

export const MEDIA_VOLUME_MODES: MediaVolumeMode[] = ['auto', 'app', 'output'];

export function normalizeVolumeMode(value: unknown): MediaVolumeMode {
  return value === 'app' || value === 'output' ? value : 'auto';
}

/** The widget's slider target for the session it is showing. */
export function mediaVolumeTarget(widget: PanelWidget | undefined, source: string): VolumeTargetQuery {
  const config = widget?.config;
  const mode = normalizeVolumeMode(config?.volumeTarget);
  if (mode !== 'output') return { mode, source, deviceId: '' };
  // Output mode ignores the source; keeping it would re-key the read on every session switch.
  const deviceId = typeof config?.volumeDeviceId === 'string' ? config.volumeDeviceId : '';
  return { mode, source: '', deviceId };
}
