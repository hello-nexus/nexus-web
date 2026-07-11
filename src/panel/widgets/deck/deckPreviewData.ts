// Catalog preview fixture - untranslated by design. ONE size-independent
// config: 2x2 truncates to the first 4 slots, 4x4 pads to 16 (padSlots). Keep
// in sync with what DeckWidget renders (see
// .agents/rules/widget-preview-fixtures.md in the master repo). Slots carry
// explicit lucide icons (names in DECK_ICONS) + palette colors and NO action:
// icon-only slots render as populated, onCell no-ops, no app-icon fetches.
import type { DeckConfig, DeckSlot } from './types';

const slot = (value: string, color: string, label?: string): DeckSlot =>
  ({ icon: { kind: 'lucide', value }, color, ...(label ? { label } : {}) });

export const DECK_PREVIEW_CONFIG: DeckConfig = {
  pages: [{
    slots: [
      slot('Play', '#22c55e', 'Stream'),
      slot('Volume2', '#06b6d4'),
      slot('Lightbulb', '#f97316', 'Lights'),
      slot('Fan', '#14b8a6'),
      slot('Sun', '#f59e0b'),
      slot('Terminal', '#8b5cf6'),
      {},
      {},
    ],
  }],
};
