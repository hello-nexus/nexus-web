import type { PanelWidgetSize } from '../../types';
import type { DeckAction, DeckConfig, DeckMonitoringStyle, DeckPage, DeckSlot } from './types';

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

// A persisted text action may still carry a `paste` key the type no longer
// declares. Strip it wherever it appears (a top-level slot, a folder, a
// sequence step, or a toggle branch) so an unrelated edit elsewhere in the
// config never round-trips it back out through the preset's whole-tree save.
function stripLegacyTextPaste(action: DeckAction): DeckAction {
  if (action.type === 'text' && 'paste' in action) {
    const rest = { ...action } as DeckAction & { paste?: unknown };
    delete rest.paste;
    return rest as DeckAction;
  }
  if (action.type === 'sequence') {
    return { ...action, steps: action.steps.map(step => ({ ...step, action: stripLegacyTextPaste(step.action) })) };
  }
  if (action.type === 'toggle') {
    return { ...action, on: stripLegacyTextPaste(action.on), off: stripLegacyTextPaste(action.off) };
  }
  return action;
}

// 'radial' was replaced by 'segments'; a persisted config can still carry it.
function normalizeMonitoringStyle(style: DeckMonitoringStyle): DeckMonitoringStyle {
  return (style as string) === 'radial' ? 'segments' : style;
}

// A persisted monitoring action may still carry the legacy 'radial' style
// (replaced by 'segments'); map it forward wherever it appears, same
// recursion shape as stripLegacyTextPaste.
function normalizeLegacyMonitoringStyle(action: DeckAction): DeckAction {
  if (action.type === 'monitoring') {
    const style = normalizeMonitoringStyle(action.style);
    return style === action.style ? action : { ...action, style };
  }
  if (action.type === 'sequence') {
    return { ...action, steps: action.steps.map(step => ({ ...step, action: normalizeLegacyMonitoringStyle(step.action) })) };
  }
  if (action.type === 'toggle') {
    return { ...action, on: normalizeLegacyMonitoringStyle(action.on), off: normalizeLegacyMonitoringStyle(action.off) };
  }
  return action;
}

function stripLegacySlot(slot: DeckSlot): DeckSlot {
  if (slot.action) return { ...slot, action: normalizeLegacyMonitoringStyle(stripLegacyTextPaste(slot.action)) };
  if (slot.folder) return { ...slot, folder: { slots: slot.folder.slots.map(stripLegacySlot) } };
  return slot;
}

function normalizePage(raw: unknown): DeckPage {
  if (!raw || typeof raw !== 'object') return { slots: [] };
  const slots = (raw as { slots?: unknown }).slots;
  return { slots: Array.isArray(slots) ? (slots as DeckSlot[]).map(stripLegacySlot) : [] };
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
    return { pages: [{ slots: (obj.slots as DeckSlot[]).map(stripLegacySlot) }], defaultTitleStyle };
  }
  return emptyDeck();
}

/** Pad/truncate a slot list to exactly `count` cells (empty cells = {}). */
export function padSlots(slots: readonly DeckSlot[], count: number): DeckSlot[] {
  const out = slots.slice(0, count);
  while (out.length < count) out.push({});
  return out;
}

/**
 * Pad a slot list to at least `count` cells, never discarding slots already
 * past `count` - a write against a narrower fitted/folder view than the
 * stored content must not truncate the rest of it (see updateSlotAt,
 * swapSlots, mapLevel below).
 */
function growSlots(slots: readonly DeckSlot[], count: number): DeckSlot[] {
  return padSlots(slots, Math.max(count, slots.length));
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
    slots: mapLevel(growSlots(pageAt(deck, p).slots, countAt(count, 0)), folderPath, 0, count, slots =>
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
    slots: mapLevel(growSlots(pageAt(deck, p).slots, countAt(count, 0)), folderPath, 0, count, slots => {
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
    const child = growSlots(s.folder?.slots ?? [], countAt(count, depth + 1));
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

/**
 * Total bound keys inside a folder (recursively), so a delete-folder confirm
 * can tell the user how many keys go with it. Counts only keys that DO
 * something (action or folder); slotHasContent above is deliberately wider
 * (a bare icon/label counts) because removing a page also discards styling.
 */
export function countBoundSlots(slots: readonly DeckSlot[]): number {
  let n = 0;
  for (const s of slots) {
    if (s.action || s.folder) n++;
    if (s.folder) n += countBoundSlots(s.folder.slots);
  }
  return n;
}

/** Whether any slot on this page (including nested folders) is configured. */
export function pageHasContent(pageConfig: DeckPage): boolean {
  return pageConfig.slots.some(slotHasContent);
}

// Trailing-edge debounce so a burst of edits (typing a label, dragging a key)
// collapses into one auto-save; used by useDeckInstance's preset auto-save
// and its undo-history burst coalescing.
export const AUTO_SAVE_DEBOUNCE_MS = 1000;

export interface FitGridPreset { cols: number; rows: number; deck: DeckConfig; }
export interface FitGridTarget { cols: number; rows: number; kind: 'physical' | 'widget'; }

/** Editable slot capacity of a folder at `depth` (0 = a page's root level), matching slotCountAtDepth's physical-Back-key reservation. */
function fitFolderCapacity(kind: FitGridTarget['kind'], keyCount: number, depth: number): number {
  if (kind === 'widget' || depth === 0) return keyCount;
  return Math.max(0, keyCount - 1);
}

// Folders don't paginate (DeckFolder has no page axis of its own); overflow
// content beyond a folder's capacity is dropped, same as any other resize.
function fitSlot(slot: DeckSlot, kind: FitGridTarget['kind'], keyCount: number, depth: number): DeckSlot {
  if (!slot.folder) return slot;
  const capacity = fitFolderCapacity(kind, keyCount, depth);
  const slots = padSlots(slot.folder.slots, capacity).map(s => fitSlot(s, kind, keyCount, depth + 1));
  return { ...slot, folder: { slots } };
}

function trimmedLength(slots: readonly DeckSlot[]): number {
  let n = slots.length;
  while (n > 0 && !slotHasContent(slots[n - 1])) n--;
  return n;
}

const autoNextSlot = (): DeckSlot => ({ action: { type: 'page', op: 'next' }, auto: true });
const autoPrevSlot = (): DeckSlot => ({ action: { type: 'page', op: 'prev' }, auto: true });

/**
 * Where one fitted root-level slot's content actually lives: a synthesized
 * next/prev nav key (never persisted, never editable), or a specific slot of
 * a specific AUTHORED page. The editor writes through this to keep editing
 * the pre-fit preset even while rendering the fitted projection; nested
 * folder indices need no translation (fitSlot pads/truncates a folder's own
 * slots without reordering them).
 */
export type FittedSlotOrigin = { kind: 'auto' } | { kind: 'authored'; page: number; slotIndex: number };

const AUTO_ORIGIN: FittedSlotOrigin = { kind: 'auto' };

interface FittedPageResult { page: DeckPage; origins: FittedSlotOrigin[]; }

/**
 * Fits one authored page's slots to a target key count T, chunking into
 * multiple pages with synthesized next/prev nav keys when the authored
 * content overflows T. Requires T >= 3 (room for prev + 1 content + next in
 * a middle chunk); a smaller T truncates instead of chunking, which never
 * happens for a real deck or widget grid (both bottom out at 4 keys).
 */
function fitPageWithOrigins(slots: readonly DeckSlot[], authoredPage: number, kind: FitGridTarget['kind'], keyCount: number): FittedPageResult[] {
  const trimLen = trimmedLength(slots);
  const content = slots.slice(0, trimLen).map(s => fitSlot(s, kind, keyCount, 1));
  const authoredAt = (i: number): FittedSlotOrigin => ({ kind: 'authored', page: authoredPage, slotIndex: i });

  if (trimLen <= keyCount || keyCount < 3) {
    return [{
      page: { slots: padSlots(content, keyCount) },
      origins: Array.from({ length: keyCount }, (_, i) => authoredAt(i)),
    }];
  }

  const results: FittedPageResult[] = [{
    page: { slots: [...content.slice(0, keyCount - 1), autoNextSlot()] },
    origins: [...Array.from({ length: keyCount - 1 }, (_, i) => authoredAt(i)), AUTO_ORIGIN],
  }];
  let idx = keyCount - 1;
  while (idx < trimLen) {
    const remaining = trimLen - idx;
    if (remaining <= keyCount - 1) {
      const tailLen = trimLen - idx;
      const origins = [AUTO_ORIGIN, ...Array.from({ length: tailLen }, (_, k) => authoredAt(idx + k))];
      // Blank cells past the last real key on the closing chunk still belong
      // to this authored page (room to add a new key there), never 'auto'.
      while (origins.length < keyCount) origins.push(authoredAt(trimLen + (origins.length - 1 - tailLen)));
      results.push({ page: { slots: padSlots([autoPrevSlot(), ...content.slice(idx, trimLen)], keyCount) }, origins });
      idx = trimLen;
    } else {
      const chunk = content.slice(idx, idx + (keyCount - 2));
      results.push({
        page: { slots: [autoPrevSlot(), ...chunk, autoNextSlot()] },
        origins: [AUTO_ORIGIN, ...Array.from({ length: keyCount - 2 }, (_, k) => authoredAt(idx + k)), AUTO_ORIGIN],
      });
      idx += keyCount - 2;
    }
  }
  return results;
}

/**
 * Chunks `preset`'s authored config to fit `target`'s key count, inserting
 * auto next/prev nav keys on overflow (DeckConfigNavigation.FitToGrid's web
 * counterpart; both sides load fitToGrid.vectors.json).
 */
export function fitToGrid(preset: FitGridPreset, target: FitGridTarget): DeckConfig {
  return fitToGridWithOrigins(preset, target).config;
}

export interface FitToGridResult {
  config: DeckConfig;
  /** Per fitted page, per root-level slot index: where that key's content actually lives. */
  origins: FittedSlotOrigin[][];
  /** Per fitted page: which authored page it was chunked from. */
  pageOrigins: number[];
}

/**
 * Same projection as fitToGrid, plus the fitted -> authored slot map an
 * editing surface needs to write through the fitted view it shows the user
 * back onto the real preset (see deckTarget.ts's makePresetDeckTarget).
 */
export function fitToGridWithOrigins(preset: FitGridPreset, target: FitGridTarget): FitToGridResult {
  const keyCount = target.cols * target.rows;
  const perAuthoredPage = preset.deck.pages.map((p, authoredPage) => fitPageWithOrigins(p.slots, authoredPage, target.kind, keyCount));
  const flat = perAuthoredPage.flat();
  if (flat.length === 0) {
    return {
      config: { pages: [{ slots: padSlots([], keyCount) }], defaultTitleStyle: preset.deck.defaultTitleStyle },
      origins: [Array.from({ length: keyCount }, () => AUTO_ORIGIN)],
      pageOrigins: [0],
    };
  }
  return {
    config: { pages: flat.map(r => r.page), defaultTitleStyle: preset.deck.defaultTitleStyle },
    origins: flat.map(r => r.origins),
    pageOrigins: perAuthoredPage.flatMap((results, authoredPage) => results.map(() => authoredPage)),
  };
}

/** How many fitted pages `preset` spans on `target`. */
export function fitPageCount(preset: FitGridPreset, target: FitGridTarget): number {
  return fitToGrid(preset, target).pages.length;
}
