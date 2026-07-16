// Target-agnostic binding for the shared Deck editor (DeckEditor.tsx): the
// touch widget's config.deck patch path and a physical Stream Deck's
// serial-keyed service config both implement the same DeckTarget shape, so
// the grid + inspector never branch on which one they're editing.
import type { PanelConfigValue, PanelWidget } from '../../types';
import type { DeckConfig, DeckSlot, DeckTitleStyle } from './types';
import {
  addPage, deckConfigPatch, innerGridForSize, padSlots, readDeckConfig, removePage, resolveViewSlots, swapSlots, updateSlotAt,
  type DepthCount,
} from './deckLayout';
import { toggleBranchSlot, withPageIndicatorDisplay } from './deckIcons';

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
    setTitleDefault(next) {
      onUpdate(deckConfigPatch({ ...config, defaultTitleStyle: next }));
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
    setTitleDefault(next) {
      persist({ ...config, defaultTitleStyle: next });
    },
  };
}

export interface DeckUploadJob {
  page: number;
  slotPath: string;
  state: 0 | 1;
  slot: DeckSlot;
}

/**
 * Slot path for one index within a folder view: the dot-joined index-chain
 * grammar DeckConfigNavigation.ParseSlotPath/BuildSlotPath define ("3",
 * "2.1.5"). The single source of truth for that grammar client-side - both
 * the key-image upload path (deckImageSlotPath) and the live-tile frame map
 * (DeckGrid's liveTiles) key off it.
 */
export function slotPathAt(folderPath: readonly number[], index: number): string {
  return [...folderPath, index].join('.');
}

/**
 * Page-qualified slotPath for the images route: the page index leads the
 * same grammar as slotPathAt ("0.3", "2.1.5"). The reserved back key stays
 * page-independent (the literal "back", built where it's uploaded) and never
 * goes through this.
 */
export function deckImageSlotPath(page: number, slotPath: string): string {
  return `${page}.${slotPath}`;
}

/**
 * Every key image job for one resolved folder view. Toggle slots render both
 * states up front, each already resolved to that branch's icon/color (state
 * 0 = off, state 1 = on) so the renderer never needs to know about toggle
 * semantics; everything else renders once at state 0.
 *
 * A 'monitoring' or 'weather' slot's key image is never uploaded from here:
 * the service owns those pixels (StreamDeckConnectionWorker's per-tick render
 * loop), so a web-driven upload would fight it and briefly stomp the live
 * tile on every config sync. DeckGrid shows the live gauge/weather tile in
 * its place instead.
 */
function viewUploadJobs(slots: readonly DeckSlot[], page: number, folderPath: readonly number[]): DeckUploadJob[] {
  const jobs: DeckUploadJob[] = [];
  slots.forEach((slot, i) => {
    if (slot.action?.type === 'monitoring' || slot.action?.type === 'weather') return;
    const slotPath = slotPathAt(folderPath, i);
    const action = slot.action;
    if (action?.type === 'toggle') {
      jobs.push({ page, slotPath, state: 0, slot: toggleBranchSlot(slot, action, false) });
      jobs.push({ page, slotPath, state: 1, slot: toggleBranchSlot(slot, action, true) });
    } else {
      jobs.push({ page, slotPath, state: 0, slot });
    }
  });
  return jobs;
}

/**
 * Every key image job across the WHOLE deck tree: every page, and every
 * folder reachable within it (recursing into `.folder` slots), each job
 * page-qualified so pages that reuse the same slot indices no longer
 * overwrite each other's ImageRefs entries server-side (the image-refs v2
 * contract). Slot counts follow the same physical Back-key reservation as a
 * live view (slotCountAtDepth), and a page's `pageIndicator` slot bakes that
 * page's own "N/total" label - it is static per page, not the currently
 * navigated page, so a full-tree sweep renders it correctly without knowing
 * which page the hardware is showing.
 */
export function computeDeckUploadJobs(target: Pick<DeckTarget, 'kind' | 'keyCount' | 'config'>): DeckUploadJob[] {
  const jobs: DeckUploadJob[] = [];
  const pageCount = target.config.pages.length;
  target.config.pages.forEach((pageConfig, page) => {
    const walk = (rawSlots: readonly DeckSlot[], folderPath: readonly number[], depth: number): void => {
      const slots = padSlots(rawSlots, slotCountAtDepth(target, depth));
      jobs.push(...viewUploadJobs(withPageIndicatorDisplay(slots, page, pageCount), page, folderPath));
      slots.forEach((slot, i) => {
        if (slot.folder) walk(slot.folder.slots, [...folderPath, i], depth + 1);
      });
    };
    walk(pageConfig.slots, [], 0);
  });
  return jobs;
}
