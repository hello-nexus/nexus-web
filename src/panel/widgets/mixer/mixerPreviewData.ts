import type { AudioDevice, AudioMixerPreset, AudioSession } from '../../../api/mixer';

/** Catalog / marketing preview: a plausible streaming mix, no I/O. */
export const MIXER_PREVIEW: {
  master: { volume: number; muted: boolean };
  sessions: AudioSession[];
  presets: AudioMixerPreset[];
  outputs: AudioDevice[];
  inputs: AudioDevice[];
} = {
  master: { volume: 0.62, muted: false },
  // Three strips, not a full session list: the catalog renders this into a small
  // tile, and a realistic mix reads as clutter at that scale.
  sessions: [
    { id: 'game', name: 'Helldivers 2', volume: 0.55, muted: false, peak: 0.42, active: true },
    { id: 'discord', name: 'Discord', volume: 0.9, muted: false, peak: 0.71, active: true },
    { id: 'spotify', name: 'Spotify', volume: 0.24, muted: false, peak: 0.19, active: true },
  ],
  presets: [
    { id: 'chatting', name: 'Chatting', masterVolume: 0.6, apps: [], outputDeviceId: 'out-headset', outputDeviceName: 'Arctis Nova Pro', inputDeviceId: 'in-mic', inputDeviceName: 'Shure MV7' },
    { id: 'gaming', name: 'Gaming', masterVolume: 0.7, apps: [], outputDeviceId: 'out-speakers', outputDeviceName: 'Speakers (Realtek)', inputDeviceId: '', inputDeviceName: '' },
  ],
  outputs: [
    { id: 'out-headset', name: 'Arctis Nova Pro', isDefault: true, direction: 'output' },
    { id: 'out-speakers', name: 'Speakers (Realtek)', isDefault: false, direction: 'output' },
  ],
  inputs: [
    { id: 'in-mic', name: 'Shure MV7', isDefault: true, direction: 'input' },
  ],
};
