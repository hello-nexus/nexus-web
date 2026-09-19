// Target-agnostic binding for the shared Deck editor (DeckEditor.tsx): a
// physical Stream Deck instance and a widget instance both edit through this
// one DeckTarget shape, so the grid + inspector never branch on which kind of
// instance is editing it.
import type { DeckPresetFull } from '../../../api/deck';
import type { DeckConfig, DeckSlot, DeckTitleStyle } from './types';
import {
  addPage, countBoundSlots, removePage, resolveViewSlots, swapSlots, updateSlotAt, fitToGridWithOrigins,
  type DepthCount, type FittedSlotOrigin,
} from './deckLayout';

export interface DeckTarget {
  kind: 'widget' | 'physical';
  /** The INSTANCE's own grid (a widget's size, or the physical deck's key
   *  layout) - what the user is actually looking at, not the preset's
   *  authored size. */
  cols: number;
  rows: number;
  /** Root-level slot count for this instance's grid. */
  keyCount: number;
  /** The FITTED projection of the active preset onto this instance's grid
   *  (deckLayout.ts's fitToGrid) - editing always happens against this, the
   *  same view the hardware/widget renders, never the pre-fit authored grid
   *  directly. A slot with `auto: true` is a synthesized page-nav key and is
   *  read-only: updateSlot/swapSlots silently ignore it. */
  config: DeckConfig;
  updateSlot(page: number, folderPath: readonly number[], slotIndex: number, next: DeckSlot): void;
  swapSlots(page: number, folderPath: readonly number[], from: number, to: number): void;
  /** Appends a new (fitted-space-empty) page to the AUTHORED preset. */
  addPage(): void;
  /** Removes the authored page that produced fitted page `page`. */
  removePage(page: number): void;
  /**
   * Bound-key count of the AUTHORED page that `removePage(page)` would
   * delete - on an overflow-chunked page this can exceed what's visible in
   * the one fitted chunk `page` shows, since removing any of its chunks
   * removes the whole authored page.
   */
  removePageKeyCount(page: number): number;
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
 * Root-level authored depth-count: the AUTHORED page's own key count (grown
 * to the instance's fitted key count on the rare case a small preset is
 * viewed on a bigger instance, so a blank cell past the preset's own
 * declared size is still a real, writable authored slot). Folder depths
 * still use the fitted capacity (unchanged from before this instance edited
 * the fitted view - folders never paginate, so their capacity was already a
 * render-time-target concept, not an authored one).
 */
function authoredDepthCount(fitted: Pick<DeckTarget, 'kind' | 'keyCount'>, authoredRootCount: number): DepthCount {
  return (depth: number) => (depth === 0 ? authoredRootCount : slotCountAtDepth(fitted, depth));
}

/**
 * Editing target for a deck instance: the FITTED projection of the active
 * preset onto `instanceGrid` (what the user physically sees - a hardware key,
 * or a widget tile), read via `config`. Writes translate the fitted (page,
 * slotIndex) touched back to the authored preset's own (page, slotIndex)
 * through fitToGridWithOrigins's map before saving; a synthesized nav key
 * (`auto: true`) has no authored origin and is silently read-only.
 */
export function makePresetDeckTarget(
  preset: DeckPresetFull,
  instanceGrid: { cols: number; rows: number },
  kind: 'widget' | 'physical',
  save: (next: DeckConfig) => void,
): DeckTarget {
  const authoredKeyCount = preset.cols * preset.rows;
  const fitted = fitToGridWithOrigins(
    { cols: preset.cols, rows: preset.rows, deck: preset.deck },
    { cols: instanceGrid.cols, rows: instanceGrid.rows, kind },
  );
  const target: Pick<DeckTarget, 'kind' | 'keyCount'> = { kind, keyCount: instanceGrid.cols * instanceGrid.rows };
  const authoredCount = authoredDepthCount(target, Math.max(authoredKeyCount, target.keyCount));

  const rootOriginAt = (page: number, index: number): FittedSlotOrigin | undefined => fitted.origins[page]?.[index];

  return {
    kind,
    cols: instanceGrid.cols,
    rows: instanceGrid.rows,
    keyCount: target.keyCount,
    config: fitted.config,
    updateSlot(page, folderPath, slotIndex, next) {
      const rootIndex = folderPath.length === 0 ? slotIndex : folderPath[0];
      const origin = rootOriginAt(page, rootIndex);
      if (!origin || origin.kind === 'auto') return;
      const authoredFolderPath = folderPath.length === 0 ? [] : [origin.slotIndex, ...folderPath.slice(1)];
      const authoredSlotIndex = folderPath.length === 0 ? origin.slotIndex : slotIndex;
      save(updateSlotAt(preset.deck, origin.page, authoredFolderPath, authoredSlotIndex, next, authoredCount));
    },
    swapSlots(page, folderPath, from, to) {
      const rootFrom = folderPath.length === 0 ? from : folderPath[0];
      const origin = rootOriginAt(page, rootFrom);
      if (!origin || origin.kind === 'auto') return;
      if (folderPath.length === 0) {
        const toOrigin = rootOriginAt(page, to);
        if (!toOrigin || toOrigin.kind === 'auto') return;
        const nextConfig = swapSlots(preset.deck, origin.page, [], origin.slotIndex, toOrigin.slotIndex, authoredCount);
        if (nextConfig !== preset.deck) save(nextConfig);
        return;
      }
      const authoredFolderPath = [origin.slotIndex, ...folderPath.slice(1)];
      const nextConfig = swapSlots(preset.deck, origin.page, authoredFolderPath, from, to, authoredCount);
      if (nextConfig !== preset.deck) save(nextConfig);
    },
    addPage() {
      save(addPage(preset.deck));
    },
    removePage(page) {
      const authoredPage = fitted.pageOrigins[page] ?? 0;
      save(removePage(preset.deck, authoredPage));
    },
    removePageKeyCount(page) {
      const authoredPage = fitted.pageOrigins[page] ?? 0;
      return countBoundSlots(preset.deck.pages[authoredPage]?.slots ?? []);
    },
    setTitleDefault(next) {
      save({ ...preset.deck, defaultTitleStyle: next });
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
