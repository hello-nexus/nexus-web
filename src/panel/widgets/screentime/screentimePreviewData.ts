// Catalog preview fixture - fake server payloads, untranslated by design.
// ONE complete full-state snapshot, independent of widget size: the short
// tiles (2x2/4x2) show the top few apps, the taller tiles (2x4/4x4) more, all
// under the total-time header. Keep in sync with what ScreentimeWidget renders
// (previewMode.test.tsx is the fixture-sync gate).
import type { ScreenTimeData } from '../../../hooks/useScreenTime';

export const SCREENTIME_PREVIEW: ScreenTimeData = {
  // today.total in seconds, consistent with h/m/s; no consumer reads it.
  focus: { id: 'figma', name: 'Figma', today: { total: 7_560, hours: 2, minutes: 6, seconds: 0 } },
  // Eight entries so the 8-bar sizes render a full state; descending by time.
  history: [
    { name: 'Figma', totalMs: 7_560_000 },
    { name: 'Chrome', totalMs: 5_340_000 },
    { name: 'Code', totalMs: 3_480_000 },
    { name: 'Slack', totalMs: 1_620_000 },
    { name: 'Spotify', totalMs: 1_080_000 },
    { name: 'Discord', totalMs: 720_000 },
    { name: 'Notion', totalMs: 480_000 },
    { name: 'Terminal', totalMs: 240_000 },
  ],
};
