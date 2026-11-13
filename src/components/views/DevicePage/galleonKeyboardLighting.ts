import type { LightingDevice } from '../../../api/lighting';

/** Search-anchor id of the "Save colors to the keyboard" row, the target of the lighting card strip. */
export const GALLEON_SAVE_ANCHOR = 'device-galleon-save-to-device';

// The service's id prefix for keyboard lighting cards; the dials card adds "dials:" after it.
const GALLEON_ID_PREFIX = 'corsair-galleon:';

/** The deck serial is the tail of the keyboard serial, so equality or a suffix match pairs them. */
function serialsMatch(keyboardSerial: string, deckSerial: string): boolean {
  const k = keyboardSerial.toLowerCase();
  const d = deckSerial.toLowerCase();
  return d.length > 0 && k.endsWith(d);
}

function keyboardSerial(deviceId: string | undefined): string | null {
  if (!deviceId || !deviceId.startsWith(GALLEON_ID_PREFIX)) return null;
  const serial = deviceId.slice(GALLEON_ID_PREFIX.length);
  return serial && !serial.startsWith('dials:') ? serial : null;
}

/** The keyboard cards that can hold their colors. */
export function galleonKeyboardCards(cards: readonly LightingDevice[]): LightingDevice[] {
  return cards.filter(c => c.saveToDeviceSupported && keyboardSerial(c.deviceId) !== null);
}

/** The keyboard lighting card that belongs to this deck: serial match first, else the only keyboard with the only deck. */
export function keyboardCardForDeck(cards: readonly LightingDevice[], deckSerial: string | null | undefined, deckSerials: readonly string[]): LightingDevice | null {
  if (!deckSerial) return null;
  const keyboards = galleonKeyboardCards(cards);
  const hit = keyboards.find(c => serialsMatch(keyboardSerial(c.deviceId) as string, deckSerial));
  if (hit) return hit;
  return keyboards.length === 1 && deckSerials.length === 1 && deckSerials[0] === deckSerial ? keyboards[0] : null;
}

/** Sidebar key of the deck page that owns this keyboard card id, or null when no deck pairs with it. */
export function galleonDeviceKey(deviceId: string | undefined, deckSerials: readonly string[], keyboardCount: number): string | null {
  const kb = keyboardSerial(deviceId);
  if (!kb) return null;
  const hit = deckSerials.find(d => serialsMatch(kb, d));
  if (hit) return `streamdeck:${hit}`;
  return keyboardCount === 1 && deckSerials.length === 1 ? `streamdeck:${deckSerials[0]}` : null;
}
