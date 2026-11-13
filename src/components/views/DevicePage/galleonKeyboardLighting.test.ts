import { describe, it, expect } from 'vitest';
import type { LightingDevice } from '../../../api/lighting';
import { galleonDeviceKey, keyboardCardForDeck } from './galleonKeyboardLighting';

const KB_SERIAL = 'CC1FE9FF494BD652A4EA3DCFA2B70CBA';
const DECK_SERIAL = 'EA3DCFA2B70CBA';
const card = (over: Partial<LightingDevice>) => ({ id: 'x', ...over }) as LightingDevice;
const kb = (serial: string, id = 'kb') => card({ id, deviceId: `corsair-galleon:${serial}`, saveToDeviceSupported: true });

describe('galleonDeviceKey', () => {
  it('pairs a keyboard serial that ends with the deck serial, case-insensitively', () => {
    expect(galleonDeviceKey(`corsair-galleon:${KB_SERIAL}`, [DECK_SERIAL], 1)).toBe(`streamdeck:${DECK_SERIAL}`);
    expect(galleonDeviceKey(`corsair-galleon:${KB_SERIAL.toLowerCase()}`, [DECK_SERIAL], 2)).toBe(`streamdeck:${DECK_SERIAL}`);
  });
  it('pairs an exact serial', () => {
    expect(galleonDeviceKey('corsair-galleon:S1', ['S1', 'S2'], 2)).toBe('streamdeck:S1');
  });
  it('falls back to the only deck when there is one keyboard', () => {
    expect(galleonDeviceKey('corsair-galleon:AAA', ['BBB'], 1)).toBe('streamdeck:BBB');
  });
  it('does not guess with several decks or keyboards, and rejects other ids', () => {
    expect(galleonDeviceKey('corsair-galleon:AAA', ['B', 'C'], 1)).toBeNull();
    expect(galleonDeviceKey('corsair-galleon:AAA', ['B'], 2)).toBeNull();
    expect(galleonDeviceKey('corsair-galleon:dials:AAA', ['AAA'], 1)).toBeNull();
    expect(galleonDeviceKey('corsair-hub:AAA', ['AAA'], 1)).toBeNull();
    expect(galleonDeviceKey(undefined, ['AAA'], 1)).toBeNull();
  });
});

describe('keyboardCardForDeck', () => {
  it('finds the keyboard card whose serial ends with the real deck serial, never the dials card', () => {
    const cards = [card({ id: 'd', deviceId: `corsair-galleon:dials:${DECK_SERIAL}` }), kb(KB_SERIAL, 'k')];
    expect(keyboardCardForDeck(cards, DECK_SERIAL, [DECK_SERIAL])?.id).toBe('k');
  });
  it('falls back to the only keyboard for the only deck', () => {
    expect(keyboardCardForDeck([kb('AAA', 'k')], 'BBB', ['BBB'])?.id).toBe('k');
  });
  it('returns null with ambiguity, no deck serial, or a card that cannot save', () => {
    expect(keyboardCardForDeck([kb('AAA'), kb('CCC')], 'BBB', ['BBB'])).toBeNull();
    expect(keyboardCardForDeck([kb('AAA')], 'BBB', ['BBB', 'DDD'])).toBeNull();
    expect(keyboardCardForDeck([kb('AAA')], null, [])).toBeNull();
    expect(keyboardCardForDeck([card({ deviceId: 'corsair-galleon:AAA' })], 'AAA', ['AAA'])).toBeNull();
  });
});
