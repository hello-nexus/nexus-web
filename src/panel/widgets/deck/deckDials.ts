import type { StreamDeckSummary } from '../../../api/streamdeck';
import type { DeckDial, DeckDialAction, DeckDialActionType } from './types';

/** Most entries a dial stack holds in the editor. */
export const MAX_DIAL_STACK = 8;

export interface DialPickerCategory {
  key: 'audio' | 'display' | 'navigation' | 'nexus' | 'custom';
  labelKey: string;
  types: DeckDialActionType[];
}

export const DIAL_PICKER_CATEGORIES: DialPickerCategory[] = [
  { key: 'audio', labelKey: 'panel.settings.deck.dial.category.audio', types: ['volume', 'micVolume', 'appVolume'] },
  { key: 'display', labelKey: 'panel.settings.deck.display', types: ['displayBrightness', 'deckBrightness', 'y70Brightness'] },
  { key: 'navigation', labelKey: 'panel.settings.deck.category.navigation', types: ['page'] },
  { key: 'nexus', labelKey: 'panel.settings.deck.category.nexus', types: ['lightingBrightness', 'monitoring'] },
  { key: 'custom', labelKey: 'panel.settings.deck.dial.category.custom', types: ['custom'] },
];

export function defaultDialAction(type: DeckDialActionType): DeckDialAction {
  switch (type) {
    case 'volume': return { type };
    case 'micVolume': return { type };
    case 'appVolume': return { type, appId: '' };
    case 'displayBrightness': return { type, displayId: '' };
    case 'deckBrightness': return { type };
    case 'lightingBrightness': return { type };
    case 'y70Brightness': return { type };
    case 'page': return { type };
    case 'monitoring': return { type, category: 'quick', sensor: 'summary/cpu-usage', press: 'none' };
    case 'custom': return { type };
  }
}

/** Lucide icon name (a DECK_ICONS key) a dial segment shows when no icon is set. */
export function dialAutoIconName(action: DeckDialAction | undefined): string {
  switch (action?.type) {
    case 'volume': return 'Volume2';
    case 'micVolume': return 'Mic';
    case 'appVolume': return 'AppWindow';
    case 'displayBrightness': return 'Monitor';
    case 'deckBrightness': return 'Sun';
    case 'lightingBrightness': return 'Lightbulb';
    case 'y70Brightness': return 'Monitor';
    case 'page': return 'Layers';
    case 'monitoring': return 'Activity';
    case 'custom': return 'Sliders';
    default: return 'Plus';
  }
}

/** Percent-bar dials draw a progress bar under the title. */
export function dialShowsBar(action: DeckDialAction | undefined): boolean {
  switch (action?.type) {
    case 'volume':
    case 'micVolume':
    case 'appVolume':
    case 'displayBrightness':
    case 'deckBrightness':
    case 'lightingBrightness':
    case 'y70Brightness': return true;
    default: return false;
  }
}

/** A dial with 2+ stack entries shows them one at a time and ignores its own fields. */
export function isDialStack(dial: DeckDial | undefined): boolean {
  return (dial?.stack?.length ?? 0) >= 2;
}

/** The entry a dial shows at `shown` (0 when it has no stack or the index is out of range). */
export function shownDialEntry(dial: DeckDial, shown = 0): DeckDial {
  if (!isDialStack(dial)) return dial;
  const stack = dial.stack!;
  return stack[shown] ?? stack[0];
}

function entryHasContent(entry: DeckDial): boolean {
  return !!entry.action || !!entry.icon || !!entry.label;
}

/** Whether any entry of the dial (every stack entry, or the dial itself) is configured. */
export function dialHasContent(dial: DeckDial): boolean {
  return isDialStack(dial) ? dial.stack!.some(entryHasContent) : entryHasContent(dial);
}

export function dialIsEmpty(dial: DeckDial): boolean {
  return !dialHasContent(dial);
}

/** Slot path the service broadcasts a dial segment under: `dial:<i>` at the root, `<folder path>.dial:<i>` inside a folder. */
export function dialSlotPathAt(folderPath: readonly number[], index: number): string {
  const dial = `dial:${index}`;
  return folderPath.length === 0 ? dial : `${folderPath.join('.')}.${dial}`;
}

/** The live tile of a dial segment for the current page and folder view. */
export function dialLiveTile(
  liveTiles: ReadonlyMap<string, string> | undefined,
  page: number,
  folderPath: readonly number[],
  index: number,
): string | undefined {
  return liveTiles?.get(`${page}:${dialSlotPathAt(folderPath, index)}`);
}

/** Starts a stack from a plain dial: its own fields become entry 0 and a blank entry follows. */
export function stackAddEntry(dial: DeckDial): DeckDial {
  if (isDialStack(dial)) {
    const stack = dial.stack!;
    return stack.length >= MAX_DIAL_STACK ? dial : { stack: [...stack, {}] };
  }
  const own = { ...dial };
  delete own.stack;
  return { stack: [own, {}] };
}

/** Removes one entry; a stack left with a single entry collapses back to a plain dial. */
export function stackRemoveEntry(dial: DeckDial, index: number): DeckDial {
  if (!isDialStack(dial)) return dial;
  const next = dial.stack!.filter((_, i) => i !== index);
  return next.length >= 2 ? { stack: next } : (next[0] ?? {});
}

export function stackMoveEntry(dial: DeckDial, index: number, direction: -1 | 1): DeckDial {
  if (!isDialStack(dial)) return dial;
  const to = index + direction;
  const stack = dial.stack!;
  if (to < 0 || to >= stack.length) return dial;
  const next = stack.slice();
  [next[index], next[to]] = [next[to], next[index]];
  return { stack: next };
}

/** Writes one edited entry (or the plain dial itself when it has no stack). */
export function writeDialEntry(dial: DeckDial, index: number, entry: DeckDial): DeckDial {
  if (!isDialStack(dial)) return entry;
  return { stack: dial.stack!.map((e, i) => (i === index ? entry : e)) };
}

export type DeckPreviewLayout = 'keys' | 'dialsBelow' | 'dialsAbove' | 'dialsSides' | 'infoScreen';

type PreviewShape = Pick<StreamDeckSummary, 'encoders' | 'dialPlacement' | 'screen' | 'touchKeys'>;

/** Which model-shaped arrangement the device page previews. */
export function deckPreviewLayout(deck: PreviewShape): DeckPreviewLayout {
  if ((deck.touchKeys ?? 0) > 0 || deck.screen?.kind === 'infoScreen') return 'infoScreen';
  if ((deck.encoders ?? 0) === 0) return 'keys';
  switch (deck.dialPlacement) {
    case 'above': return 'dialsAbove';
    case 'sides': return 'dialsSides';
    default: return 'dialsBelow';
  }
}

/** Height / width of one key; 1 for every square-key model. */
export function deckKeyAspect(deck: Pick<StreamDeckSummary, 'keyWidth' | 'keyHeight'>): number {
  const w = deck.keyWidth ?? 0;
  const h = deck.keyHeight ?? 0;
  return w > 0 && h > 0 ? h / w : 1;
}

/** Dial index a dnd id names: a segment (`dial:<i>`) or a knob (`knob:<i>`). */
export function parseDialDndId(id: string): number | null {
  const m = /^(?:dial|knob):(\d+)$/.exec(id);
  return m ? Number(m[1]) : null;
}

/** Dial action type a dial-picker drag carries (`pickdial:<type>`). */
export function parseDialPickId(id: string): DeckDialActionType | null {
  if (!id.startsWith('pickdial:')) return null;
  const type = id.slice('pickdial:'.length);
  return DIAL_PICKER_CATEGORIES.some(c => (c.types as string[]).includes(type)) ? (type as DeckDialActionType) : null;
}

/** Binds a picked action type to a dial entry, keeping its label, icon and color. */
export function dialWithActionType(entry: DeckDial, type: DeckDialActionType): DeckDial {
  return { ...entry, action: defaultDialAction(type) };
}

/** The entry at `index` of a stack, or the dial itself when it has none. */
export function dialEntryAt(dial: DeckDial, index: number): DeckDial {
  return isDialStack(dial) ? (dial.stack![index] ?? {}) : dial;
}

/** Binds a picked action type to one entry of a dial. */
export function assignDialAction(dial: DeckDial, entryIndex: number, type: DeckDialActionType): DeckDial {
  return writeDialEntry(dial, entryIndex, dialWithActionType(dialEntryAt(dial, entryIndex), type));
}
