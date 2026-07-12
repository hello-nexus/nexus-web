import { fetchService, postService } from './service';
import type { SystemVolumeState } from '../hooks/useSystemVolume';

// Host-machine controls (volume, power) the service exposes for the deck
// widget; the command palette drives the same endpoints. The state shape is
// useSystemVolume's - one contract for the /system/volume endpoint.

export type { SystemVolumeState } from '../hooks/useSystemVolume';

export const fetchSystemVolume = () =>
  fetchService<SystemVolumeState>('/system/volume');

export const setSystemVolume = (volume: number) =>
  postService('/system/volume', { volume });

export const setSystemMuted = (muted: boolean) =>
  postService('/system/volume/mute', { muted });

export const systemPower = (action: 'lock' | 'sleep') =>
  postService(`/system/power/${action}`, {});
