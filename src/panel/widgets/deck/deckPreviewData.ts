// Catalog preview fixture - untranslated by design. ONE size-independent
// config: 2x2 truncates to the first 4 slots, 4x4 pads to 16 (padSlots). Keep
// in sync with what DeckWidget renders (see
// .agents/rules/widget-preview-fixtures.md in the master repo). Slots carry
// explicit lucide icons (names in DECK_ICONS) + palette colors and NO action:
// icon-only slots render as populated, onCell no-ops, no app-icon fetches.
import type { DeckConfig, DeckSlot } from './types';

// Titles default to hidden, so a labelled preview slot enables its title
// explicitly to demonstrate the label on the key.
const slot = (value: string, color: string, label?: string): DeckSlot =>
  ({ icon: { kind: 'lucide', value }, color, ...(label ? { label, title: { show: true } } : {}) });

// Demonstrates the monitoring tile alongside the icon-based keys. DeckMonitoringCell
// never resolves this action's category/sensor in preview mode (it renders its
// own frozen fixture, see PREVIEW_SENSOR_NAME/PREVIEW_FORMATTED there) - the
// values here just need to be contract-shaped, not live.
const monitoringSlot: DeckSlot = {
  action: { type: 'monitoring', category: 'quick', sensor: 'summary/cpu-usage', style: 'line', showName: true, press: 'none' },
};

export const DECK_PREVIEW_CONFIG: DeckConfig = {
  pages: [{
    slots: [
      slot('Play', '#22c55e', 'Stream'),
      slot('Volume2', '#06b6d4'),
      slot('Lightbulb', '#f97316', 'Lights'),
      slot('Fan', '#14b8a6'),
      slot('Sun', '#f59e0b'),
      slot('Terminal', '#8b5cf6'),
      monitoringSlot,
      {},
    ],
  }],
};
