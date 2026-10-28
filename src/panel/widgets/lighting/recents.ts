export const RECENTS_CAP = 16;

/** Moves `item` to the front, dropping an earlier copy (case-insensitive) and anything past the cap. */
export function pushRecent(list: readonly string[], item: string, cap = RECENTS_CAP): string[] {
  const key = item.toLowerCase();
  return [item, ...list.filter(x => x.toLowerCase() !== key)].slice(0, cap);
}
