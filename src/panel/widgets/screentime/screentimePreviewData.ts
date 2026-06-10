// Catalog preview fixture — fake server payloads, untranslated by design.
// ONE complete full-state snapshot, independent of widget size: the 2x2 total
// and the larger-size app list both render from this. Keep in sync with what
// ScreentimeWidget renders (see .agents/rules/widget-preview-fixtures.md in
// the master repo).
import type { ScreenTimeData } from '../../../hooks/useScreenTime';

export const SCREENTIME_PREVIEW: ScreenTimeData = {
  // today.total in seconds, consistent with h/m/s; no consumer reads it.
  focus: { id: 'figma', name: 'Figma', today: { total: 7_560, hours: 2, minutes: 6, seconds: 0 } },
  // Sums to 5h 00m.
  history: [
    { name: 'Figma', totalMs: 7_560_000 },
    { name: 'Chrome', totalMs: 5_340_000 },
    { name: 'Code', totalMs: 3_480_000 },
    { name: 'Slack', totalMs: 1_620_000 },
  ],
};
