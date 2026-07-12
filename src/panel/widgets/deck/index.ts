import { LayoutGrid } from 'lucide-react';
import type { AppManifest } from '../types';
import { DeckWidget } from './DeckWidget';
import { DeckSettings } from './DeckSettings';
import { defaultDeckConfig, deckConfigPatch } from './deckLayout';

export const deckApp: AppManifest = {
  meta: {
    type: 'deck',
    i18nKey: 'panel.widget.deck',
    icon: LayoutGrid,
    sizes: ['2x2', '4x2', '4x4'],
    defaultSize: '4x2',
    supportsImmersive: { portrait: false, landscape: false },
    hasConfig: true,
    touch: true,
    usesSlotSelection: true,
    defaultConfig: () => deckConfigPatch(defaultDeckConfig()),
  },
  Widget: DeckWidget,
  Settings: DeckSettings,
  resolveInitialSelection: ({ point, widget }) => {
    if (typeof document === 'undefined') return undefined;
    const widgetEl = document.querySelector<HTMLElement>(`[data-panel-widget-id="${widget.id}"]`);
    if (!widgetEl) return undefined;
    const slots = widgetEl.querySelectorAll<HTMLElement>('[data-deck-slot-index]');
    for (const slot of slots) {
      const r = slot.getBoundingClientRect();
      if (point.x >= r.left && point.x <= r.right && point.y >= r.top && point.y <= r.bottom) {
        const parsed = Number.parseInt(slot.dataset.deckSlotIndex ?? '', 10);
        if (Number.isFinite(parsed)) return { selectedSlot: parsed };
      }
    }
    return undefined;
  },
};
