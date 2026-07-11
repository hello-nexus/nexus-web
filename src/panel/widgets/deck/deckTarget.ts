// Target-agnostic binding for the shared Deck editor (DeckEditor.tsx): the
// touch widget's config.deck patch path and a physical Stream Deck's
// serial-keyed service config both implement the same DeckTarget shape, so
// the grid + inspector never branch on which one they're editing.
import type { PanelConfigValue, PanelWidget } from '../../types';
import type { DeckConfig, DeckSlot } from './types';
import {
  addPage, deckConfigPatch, innerGridForSize, readDeckConfig, removePage, resolveViewSlots, swapSlots, updateSlotAt,
  type DepthCount,
} from './deckLayout';
import { toggleBranchSlot } from './deckIcons';

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

export function makeWidgetDeckTarget(
  widget: PanelWidget,
  onUpdate: (patch: Record<string, PanelConfigValue>) => void,
): DeckTarget {
  const config = readDeckConfig(widget);
  const { cols, rows, count } = innerGridForSize(widget.size);
  const target: Pick<DeckTarget, 'kind' | 'keyCount'> = { kind: 'widget', keyCount: count };
  return {
    kind: 'widget',
    cols,
    rows,
    keyCount: count,
    config,
    updateSlot(page, folderPath, slotIndex, next) {
      onUpdate(deckConfigPatch(updateSlotAt(config, page, folderPath, slotIndex, next, depthCount(target))));
    },
    swapSlots(page, folderPath, from, to) {
      onUpdate(deckConfigPatch(swapSlots(config, page, folderPath, from, to, depthCount(target))));
    },
    addPage() {
      onUpdate(deckConfigPatch(addPage(config)));
    },
    removePage(page) {
      onUpdate(deckConfigPatch(removePage(config, page)));
    },
  };
}

export function makePhysicalDeckTarget(
  cols: number,
  rows: number,
  keyCount: number,
  config: DeckConfig,
  persist: (next: DeckConfig) => void,
): DeckTarget {
  const target: Pick<DeckTarget, 'kind' | 'keyCount'> = { kind: 'physical', keyCount };
  return {
    kind: 'physical',
    cols,
    rows,
    keyCount,
    config,
    updateSlot(page, folderPath, slotIndex, next) {
      persist(updateSlotAt(config, page, folderPath, slotIndex, next, depthCount(target)));
    },
    swapSlots(page, folderPath, from, to) {
      const nextConfig = swapSlots(config, page, folderPath, from, to, depthCount(target));
      if (nextConfig !== config) persist(nextConfig);
    },
    addPage() {
      persist(addPage(config));
    },
    removePage(page) {
      persist(removePage(config, page));
    },
  };
}

export interface DeckUploadJob {
  slotPath: string;
  state: 0 | 1;
  slot: DeckSlot;
}

/**
 * Every key image that needs (re)rendering + uploading for one resolved
 * folder view. Toggle slots render both states up front, each already
 * resolved to that branch's icon/color (state 0 = off, state 1 = on) so the
 * renderer never needs to know about toggle semantics; everything else
 * renders once at state 0.
 */
export function computeViewUploadJobs(slots: readonly DeckSlot[], folderPath: readonly number[]): DeckUploadJob[] {
  const jobs: DeckUploadJob[] = [];
  slots.forEach((slot, i) => {
    const slotPath = [...folderPath, i].join('.');
    const action = slot.action;
    if (action?.type === 'toggle') {
      jobs.push({ slotPath, state: 0, slot: toggleBranchSlot(slot, action, false) });
      jobs.push({ slotPath, state: 1, slot: toggleBranchSlot(slot, action, true) });
    } else {
      jobs.push({ slotPath, state: 0, slot });
    }
  });
  return jobs;
}
