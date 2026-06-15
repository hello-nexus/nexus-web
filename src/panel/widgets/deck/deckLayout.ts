import type { PanelWidget, PanelWidgetSize, PanelConfigValue } from '../../types';
import type { DeckConfig, DeckSlot } from './types';

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
  return { slots: [] };
}

// Seeded into a freshly-added deck so it's useful out of the box rather than a
// grid of empty cells: two volume nudges plus "open system settings" (a
// per-OS service action). Remaining cells pad empty.
export function defaultDeckConfig(): DeckConfig {
  return {
    slots: [
      { action: { type: 'system', action: { op: 'volumeUp' } } },
      { action: { type: 'system', action: { op: 'volumeDown' } } },
      { action: { type: 'system', action: { op: 'openSettings' } } },
    ],
  };
}

/** Parse + normalize the deck config off a widget. */
export function readDeckConfig(widget: PanelWidget): DeckConfig {
  return normalizeDeckConfig(widget.config?.deck as unknown);
}

export function normalizeDeckConfig(raw: unknown): DeckConfig {
  if (!raw || typeof raw !== 'object') return emptyDeck();
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
 * The slot list shown for a folder path, padded to `count`. Returns null when
 * the folder path no longer resolves (e.g. a resize removed the folder) so the
 * caller can reset the view.
 */
export function resolveViewSlots(
  deck: DeckConfig,
  folderPath: readonly number[],
  count: number,
): DeckSlot[] | null {
  let slots = padSlots(deck.slots, count);
  for (const idx of folderPath) {
    const folder = slots[idx]?.folder;
    if (!folder) return null;
    slots = padSlots(folder.slots, count);
  }
  return slots;
}

/** Immutably replace the slot at (folderPath, slotIndex). */
export function updateSlotAt(
  deck: DeckConfig,
  folderPath: readonly number[],
  slotIndex: number,
  next: DeckSlot,
  count: number,
): DeckConfig {
  return {
    ...deck,
    slots: mapLevel(padSlots(deck.slots, count), folderPath, 0, count, slots =>
      slots.map((s, i) => (i === slotIndex ? next : s))),
  };
}

/** Immutably swap two slots at the given folder level (drag-reorder). */
export function swapSlots(
  deck: DeckConfig,
  folderPath: readonly number[],
  from: number,
  to: number,
  count: number,
): DeckConfig {
  if (from === to) return deck;
  return {
    ...deck,
    slots: mapLevel(padSlots(deck.slots, count), folderPath, 0, count, slots => {
      const out = slots.slice();
      [out[from], out[to]] = [out[to], out[from]];
      return out;
    }),
  };
}

function mapLevel(
  slots: DeckSlot[],
  folderPath: readonly number[],
  depth: number,
  count: number,
  fn: (slots: DeckSlot[]) => DeckSlot[],
): DeckSlot[] {
  if (depth === folderPath.length) return fn(slots);
  const idx = folderPath[depth];
  return slots.map((s, i) => {
    if (i !== idx) return s;
    const child = padSlots(s.folder?.slots ?? [], count);
    return { ...s, folder: { slots: mapLevel(child, folderPath, depth + 1, count, fn) } };
  });
}

/** Persist a DeckConfig back through onUpdate (whole tree under the `deck` key). */
export function deckConfigPatch(deck: DeckConfig): Record<string, PanelConfigValue> {
  return { deck: deck as unknown as PanelConfigValue };
}
