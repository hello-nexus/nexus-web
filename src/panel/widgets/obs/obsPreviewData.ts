// Catalog preview fixture - fake server payloads, untranslated by design.
// ONE complete full-state snapshot, independent of widget size: scene strip
// (4x2+) and compact controls (2x2) both render from this. Keep in sync with
// what ObsWidget renders (previewMode.test.tsx is the fixture-sync gate).
import type { ObsStatusResponse } from '../../../api/obs';

export const OBS_PREVIEW: ObsStatusResponse = {
  error: false,
  msg: '',
  reason: '',
  connected: true,
  host: '127.0.0.1',
  port: 4455,
  activeScene: 'Gameplay',
  scenes: [
    { name: 'Gameplay', uuid: 'preview-scene-1' },
    { name: 'Intermission', uuid: 'preview-scene-2' },
    { name: 'Starting Soon', uuid: 'preview-scene-3' },
  ],
  // Idle: a Live badge in the picker reads as real state.
  streaming: false,
  streamingDurationMs: 0,
  recording: false,
  recordingDurationMs: 0,
};
