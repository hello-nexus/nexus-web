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
  return { pages: [{ slots: [] }] };
}

// Seeded into a freshly-added deck so it's useful out of the box rather than a
// grid of empty cells: two volume nudges plus "open system settings" (a
// per-OS service action). Remaining cells pad empty.
export function defaultDeckConfig(): DeckConfig {
  return {
    pages: [{
      slots: [
        { action: { type: 'system', action: { op: 'volumeUp' } } },
        { action: { type: 'system', action: { op: 'volumeDown' } } },
        { action: { type: 'system', action: { op: 'openSettings' } } },
      ],
    }],
  };
}

/** Parse + normalize the deck config off a widget. */
export function readDeckConfig(widget: PanelWidget): DeckConfig {
  return normalizeDeckConfig(widget.config?.deck as unknown);
}

function normalizePage(raw: unknown): DeckPage {
  if (!raw || typeof raw !== 'object') return { slots: [] };
  const slots = (raw as { slots?: unknown }).slots;
  return { slots: Array.isArray(slots) ? (slots as DeckSlot[]) : [] };
}

/**
 * Normalizes any persisted shape into the current { pages } model. A legacy
 * single-grid config `{ slots: [...] }` (pre-pagination) becomes a single
 * page holding those slots, so every existing widget config and persisted
 * physical deck config keeps working unchanged. Neither shape present → one
 * empty page (a DeckConfig always has at least one page).
 */
export function normalizeDeckConfig(raw: unknown): DeckConfig {
  if (!raw || typeof raw !== 'object') return emptyDeck();
  const obj = raw as { pages?: unknown; slots?: unknown; defaultTitleStyle?: unknown };
  const defaultTitleStyle = obj.defaultTitleStyle && typeof obj.defaultTitleStyle === 'object'
    ? (obj.defaultTitleStyle as DeckConfig['defaultTitleStyle'])
    : undefined;
  if (Array.isArray(obj.pages)) {
    const pages = obj.pages.map(normalizePage);
    return { pages: pages.length > 0 ? pages : [{ slots: [] }], defaultTitleStyle };
  }
  if (Array.isArray(obj.slots)) {
    return { pages: [{ slots: obj.slots as DeckSlot[] }], defaultTitleStyle };
  }
  return emptyDeck();
}

/** Pad/truncate a slot list to exactly `count` cells (empty cells = {}). */
export function padSlots(slots: readonly DeckSlot[], count: number): DeckSlot[] {
  const out = slots.slice(0, count);
  while (out.length < count) out.push({});
  return out;
}

// A plain number applies uniformly at every folder depth (the touch widget's
// only usage). A physical Stream Deck target instead reserves a Back key at
// every folder depth >= 1, so it needs a smaller count there than at the
// root - hence the depth-indexed function form. See deckTarget.ts.
export type DepthCount = number | ((depth: number) => number);

function countAt(count: DepthCount, depth: number): number {
  return typeof count === 'function' ? count(depth) : count;
}

function pageAt(deck: DeckConfig, page: number): DeckPage {
  return deck.pages[page] ?? { slots: [] };
}

// Clamps to a real page index before an array-index write: an out-of-range
// page would otherwise assign past the end of `pages`, leaving sparse holes
// that serialize as null entries.
function clampPageIndex(deck: DeckConfig, page: number): number {
  return Math.min(Math.max(page, 0), deck.pages.length - 1);
}

/**
 * The slot list shown for a page + folder path, padded to `count`. Returns
 * null when the folder path no longer resolves (e.g. a resize removed the
 * folder) so the caller can reset the view.
 */
export function resolveViewSlots(
  deck: DeckConfig,
  page: number,
  folderPath: readonly number[],
  count: DepthCount,
): DeckSlot[] | null {
  let slots = padSlots(pageAt(deck, page).slots, countAt(count, 0));
  for (let depth = 0; depth < folderPath.length; depth++) {
    const folder = slots[folderPath[depth]]?.folder;
    if (!folder) return null;
    slots = padSlots(folder.slots, countAt(count, depth + 1));
  }
  return slots;
}

/** Immutably replace the slot at (page, folderPath, slotIndex). */
export function updateSlotAt(
  deck: DeckConfig,
  page: number,
  folderPath: readonly number[],
  slotIndex: number,
  next: DeckSlot,
  count: DepthCount,
): DeckConfig {
  const p = clampPageIndex(deck, page);
  const pages = deck.pages.slice();
  pages[p] = {
    slots: mapLevel(padSlots(pageAt(deck, p).slots, countAt(count, 0)), folderPath, 0, count, slots =>
      slots.map((s, i) => (i === slotIndex ? next : s))),
  };
  return { ...deck, pages };
}

/** Immutably swap two slots at the given page + folder level (drag-reorder). */
export function swapSlots(
  deck: DeckConfig,
  page: number,
  folderPath: readonly number[],
  from: number,
  to: number,
  count: DepthCount,
): DeckConfig {
  if (from === to) return deck;
  const p = clampPageIndex(deck, page);
  const pages = deck.pages.slice();
  pages[p] = {
    slots: mapLevel(padSlots(pageAt(deck, p).slots, countAt(count, 0)), folderPath, 0, count, slots => {
      const out = slots.slice();
      [out[from], out[to]] = [out[to], out[from]];
      return out;
    }),
  };
  return { ...deck, pages };
}

function mapLevel(
  slots: DeckSlot[],
  folderPath: readonly number[],
  depth: number,
  count: DepthCount,
  fn: (slots: DeckSlot[]) => DeckSlot[],
): DeckSlot[] {
  if (depth === folderPath.length) return fn(slots);
  const idx = folderPath[depth];
  return slots.map((s, i) => {
    if (i !== idx) return s;
    const child = padSlots(s.folder?.slots ?? [], countAt(count, depth + 1));
    return { ...s, folder: { slots: mapLevel(child, folderPath, depth + 1, count, fn) } };
  });
}

/** Upper bound on pages per deck; bounds page-strip and folder-nav growth. */
export const MAX_DECK_PAGES = 10;

/** Appends a fresh empty page, up to MAX_DECK_PAGES (no-op at the cap). */
export function addPage(deck: DeckConfig): DeckConfig {
  if (deck.pages.length >= MAX_DECK_PAGES) return deck;
  return { ...deck, pages: [...deck.pages, { slots: [] }] };
}

/** Removes the page at `page`. No-op when it's the deck's only page. */
export function removePage(deck: DeckConfig, page: number): DeckConfig {
  if (deck.pages.length <= 1) return deck;
  return { ...deck, pages: deck.pages.filter((_, i) => i !== page) };
}

function slotHasContent(slot: DeckSlot): boolean {
  if (slot.action || slot.icon || slot.label) return true;
  if (slot.folder) return slot.folder.slots.some(slotHasContent);
  return false;
}

/** Whether any slot on this page (including nested folders) is configured. */
export function pageHasContent(pageConfig: DeckPage): boolean {
  return pageConfig.slots.some(slotHasContent);
}

/** Persist a DeckConfig back through onUpdate (whole tree under the `deck` key). */
export function deckConfigPatch(deck: DeckConfig): Record<string, PanelConfigValue> {
  return { deck: deck as unknown as PanelConfigValue };
}
