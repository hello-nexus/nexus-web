/** The deck key under a right-click, read from the attributes DeckWidget and DeckGrid render; undefined off a key. */
export function deckKeyAt(target: EventTarget | null): { page: number; folderPath: number[]; slot: number } | undefined {
  if (!(target instanceof Element)) return undefined;
  const slotEl = target.closest<HTMLElement>('[data-deck-slot-index]');
  const viewEl = target.closest<HTMLElement>('[data-deck-page]');
  if (!slotEl || !viewEl) return undefined;
  const slot = Number(slotEl.dataset.deckSlotIndex);
  const page = Number(viewEl.dataset.deckPage);
  const folder = viewEl.dataset.deckFolder ?? '';
  const folderPath = folder === '' ? [] : folder.split('.').map(Number);
  if (![slot, page, ...folderPath].every(n => Number.isInteger(n) && n >= 0)) return undefined;
  return { page, folderPath, slot };
}
