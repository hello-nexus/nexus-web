import type { PanelWidget, PanelWidgetSize, PanelConfigValue } from '../../types';
import type { DeckConfig, DeckPage, DeckSlot } from './types';

export interface InnerGrid { cols: number; rows: number; count: number; }

/** Inner icon-grid dimensions for a widget size. */
export function innerGridForSize(size: PanelWidgetSize | string): InnerGrid {
  switch (size) {
    case '4x4': return { cols: 4, rows: 4, count: 16 };
    case '4x2': return { cols: 4, rows: 2, count: 8 };
    case '2x4': return { cols: 2, rows: 4, count: 8 };
    case '2x2':
    default: return { cols: 2, rows: 2, count: 4 };
  }
}

export function emptyDeck(): DeckConfig {
  return { showLabels: false, pages: [{ slots: [] }] };
}

/** Parse + normalize the deck config off a widget (always ≥1 page). */
export function readDeckConfig(widget: PanelWidget): DeckConfig {
  const raw = widget.config?.deck as unknown;
  return normalizeDeckConfig(raw);
}

export function normalizeDeckConfig(raw: unknown): DeckConfig {
  if (!raw || typeof raw !== 'object') return emptyDeck();
  const obj = raw as { showLabels?: unknown; pages?: unknown };
  const pages = Array.isArray(obj.pages)
    ? obj.pages.map(normalizePage).filter(Boolean) as DeckPage[]
    : [];
  return {
    showLabels: obj.showLabels === true,
    pages: pages.length > 0 ? pages : [{ slots: [] }],
  };
}

function normalizePage(raw: unknown): DeckPage | null {
  if (!raw || typeof raw !== 'object') return { slots: [] };
  const slots = (raw as { slots?: unknown }).slots;
  return { slots: Array.isArray(slots) ? (slots as DeckSlot[]) : [] };
}

/** Pad/truncate a slot list to exactly `count` cells (empty cells = {}). */
export function padSlots(slots: readonly DeckSlot[], count: number): DeckSlot[] {
  const out = slots.slice(0, count);
  while (out.length < count) out.push({});
  return out;
}

/**
 * The slot list shown for a given page + folder path, padded to `count`.
 * Returns null when the folder path no longer resolves (e.g. after a resize
 * removed the folder cell) so the caller can reset the view.
 */
export function resolveViewSlots(
  deck: DeckConfig,
  pageIndex: number,
  folderPath: readonly number[],
  count: number,
): DeckSlot[] | null {
  const page = deck.pages[pageIndex];
  if (!page) return null;
  let slots = padSlots(page.slots, count);
  for (const idx of folderPath) {
    const folder = slots[idx]?.folder;
    if (!folder) return null;
    slots = padSlots(folder.slots, count);
  }
  return slots;
}

/**
 * Immutably replace the slot at (pageIndex, folderPath, slotIndex). Returns a
 * new DeckConfig. Pads intermediate slot lists to `count` so positional indices
 * stay stable.
 */
export function updateSlotAt(
  deck: DeckConfig,
  pageIndex: number,
  folderPath: readonly number[],
  slotIndex: number,
  next: DeckSlot,
  count: number,
): DeckConfig {
  const pages = deck.pages.map((p, pi) => {
    if (pi !== pageIndex) return p;
    return { slots: replaceInTree(padSlots(p.slots, count), folderPath, 0, slotIndex, next, count) };
  });
  return { ...deck, pages };
}

function replaceInTree(
  slots: DeckSlot[],
  folderPath: readonly number[],
  depth: number,
  slotIndex: number,
  next: DeckSlot,
  count: number,
): DeckSlot[] {
  if (depth === folderPath.length) {
    return slots.map((s, i) => (i === slotIndex ? next : s));
  }
  const idx = folderPath[depth];
  return slots.map((s, i) => {
    if (i !== idx) return s;
    const childSlots = padSlots(s.folder?.slots ?? [], count);
    return { ...s, folder: { slots: replaceInTree(childSlots, folderPath, depth + 1, slotIndex, next, count) } };
  });
}

/** Persist a DeckConfig back through onUpdate (whole tree under the `deck` key). */
export function deckConfigPatch(deck: DeckConfig): Record<string, PanelConfigValue> {
  return { deck: deck as unknown as PanelConfigValue };
}
