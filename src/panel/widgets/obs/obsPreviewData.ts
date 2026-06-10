// Catalog preview fixture — fake server payloads, untranslated by design.
// ONE complete full-state snapshot, independent of widget size: scene strip
// (4x2+) and compact controls (2x2) both render from this. Keep in sync with
// what ObsWidget renders (see .agents/rules/widget-preview-fixtures.md in the
// master repo).
import type { ObsStatusResponse } from '../../../api/obs';

export const OBS_PREVIEW: ObsStatusResponse = {
  error: false,
  msg: '',
  connected: true,
  host: '127.0.0.1',
  port: 4455,
  activeScene: 'Gameplay',
  scenes: [
    { name: 'Gameplay', uuid: 'preview-scene-1' },
    { name: 'Intermission', uuid: 'preview-scene-2' },
    { name: 'Starting Soon', uuid: 'preview-scene-3' },
  ],
  // Live stream at 42min, not recording: shows the duration badge on one
  // action and the idle state on the other.
  streaming: true,
  streamingDurationMs: 2_520_000,
  recording: false,
  recordingDurationMs: 0,
};
