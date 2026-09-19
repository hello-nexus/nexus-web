// Target-agnostic binding for the shared Deck editor (DeckEditor.tsx): a
// physical Stream Deck instance and a widget instance both edit the same
// host-wide preset's authored grid through this one DeckTarget shape, so the
// grid + inspector never branch on which kind of instance is editing it.
import type { DeckPresetFull } from '../../../api/deck';
import type { DeckConfig, DeckSlot, DeckTitleStyle } from './types';
import { addPage, removePage, resolveViewSlots, swapSlots, updateSlotAt, type DepthCount } from './deckLayout';

export interface DeckTarget {
  kind: 'widget' | 'physical';
  cols: number;
  rows: number;
  /** Root-level slot count (the widget's size grid, or the deck's keyCount). */
  keyCount: number;
  config: DeckConfig;
  updateSlot(page: number, folderPath: readonly number[], slotIndex: number, next: DeckSlot): void;
  swapSlots(page: number, folderPath: readonly number[], from: number, to: number): void;
  addPage(): void;
  removePage(page: number): void;
  /** Deck-wide default title style seeded onto newly bound keys. */
  setTitleDefault(next: DeckTitleStyle | undefined): void;
}

/**
 * How many editable slots a folder level holds for this target. The touch
 * widget shows the same count at every depth (Back is an overlay, not a
 * grid cell - see DeckWidget). A physical deck reserves its top-left key as
 * Back at every folder depth >= 1, so nested levels hold one fewer slot.
 */
export function slotCountAtDepth(target: Pick<DeckTarget, 'kind' | 'keyCount'>, depth: number): number {
  if (target.kind === 'widget') return target.keyCount;
  return depth === 0 ? target.keyCount : Math.max(0, target.keyCount - 1);
}

function depthCount(target: Pick<DeckTarget, 'kind' | 'keyCount'>): DepthCount {
  return (depth: number) => slotCountAtDepth(target, depth);
}

/** Slots shown for a page + folder path, resolved against a target's per-depth counts. */
export function resolveTargetView(target: DeckTarget, page: number, folderPath: readonly number[]): DeckSlot[] | null {
  return resolveViewSlots(target.config, page, folderPath, depthCount(target));
}

/**
 * Editing target for a deck instance: always the ACTIVE PRESET's authored
 * grid (preset.cols/rows), never the instance's own physical/widget grid -
 * fitToGrid handles the render-time projection separately. `kind` still
 * distinguishes a physical instance (Back-key reservation in folders) from a
 * widget instance, same as before.
 */
export function makePresetDeckTarget(
  preset: DeckPresetFull,
  kind: 'widget' | 'physical',
  save: (next: DeckConfig) => void,
): DeckTarget {
  const config = preset.deck;
  const target: Pick<DeckTarget, 'kind' | 'keyCount'> = { kind, keyCount: preset.cols * preset.rows };
  return {
    kind,
    cols: preset.cols,
    rows: preset.rows,
    keyCount: target.keyCount,
    config,
    updateSlot(page, folderPath, slotIndex, next) {
      save(updateSlotAt(config, page, folderPath, slotIndex, next, depthCount(target)));
    },
    swapSlots(page, folderPath, from, to) {
      const nextConfig = swapSlots(config, page, folderPath, from, to, depthCount(target));
      if (nextConfig !== config) save(nextConfig);
    },
    addPage() {
      save(addPage(config));
    },
    removePage(page) {
      save(removePage(config, page));
    },
    setTitleDefault(next) {
      save({ ...config, defaultTitleStyle: next });
    },
  };
}

/**
 * Slot path for one index within a folder view: the dot-joined index-chain
 * grammar DeckConfigNavigation.ParseSlotPath/BuildSlotPath define ("3",
 * "2.1.5") - the live-tile frame map (DeckGrid's liveTiles) keys off it.
 */
export function slotPathAt(folderPath: readonly number[], index: number): string {
  return [...folderPath, index].join('.');
}
