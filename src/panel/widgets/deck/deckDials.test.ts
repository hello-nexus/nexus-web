// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  DIAL_PICKER_CATEGORIES, MAX_DIAL_STACK, defaultDialAction, deckKeyAspect, deckPreviewLayout, dialLiveTile, dialSlotPathAt,
  dialIsEmpty, dialWithActionType, isDialStack, parseDialDndId, parseDialPickId, shownDialEntry, stackAddEntry, stackMoveEntry,
  stackRemoveEntry, writeDialEntry,
} from './deckDials';

describe('dial picker', () => {
  it('every action type appears in exactly one category and seeds an action of that type', () => {
    const types = DIAL_PICKER_CATEGORIES.flatMap(c => c.types);
    expect(new Set(types).size).toBe(types.length);
    expect(types).toHaveLength(10);
    for (const type of types) expect(defaultDialAction(type).type).toBe(type);
  });

  it('dialWithActionType keeps label, icon and color', () => {
    const next = dialWithActionType({ label: 'L', color: '#fff', icon: { kind: 'emoji', value: 'x' }, action: { type: 'page' } }, 'volume');
    expect(next).toEqual({ label: 'L', color: '#fff', icon: { kind: 'emoji', value: 'x' }, action: { type: 'volume' } });
  });
});

describe('dial ids and paths', () => {
  it('builds root and folder slot paths', () => {
    expect(dialSlotPathAt([], 2)).toBe('dial:2');
    expect(dialSlotPathAt([1, 3], 0)).toBe('1.3.dial:0');
  });

  it('reads only the frame of the current page and folder view', () => {
    const tiles = new Map([['0:dial:1', 'page'], ['0:2.dial:1', 'folder']]);
    expect(dialLiveTile(tiles, 0, [2], 1)).toBe('folder');
    expect(dialLiveTile(tiles, 0, [5], 1)).toBeUndefined();
    expect(dialLiveTile(tiles, 0, [], 1)).toBe('page');
    expect(dialLiveTile(tiles, 0, [], 0)).toBeUndefined();
    expect(dialLiveTile(undefined, 0, [], 0)).toBeUndefined();
  });

  it('parses dnd ids', () => {
    expect(parseDialDndId('dial:3')).toBe(3);
    expect(parseDialDndId('knob:0')).toBe(0);
    expect(parseDialDndId('3')).toBeNull();
    expect(parseDialDndId('pick:folder')).toBeNull();
    expect(parseDialPickId('pickdial:volume')).toBe('volume');
    expect(parseDialPickId('pickdial:nope')).toBeNull();
    expect(parseDialPickId('pick:volume')).toBeNull();
  });
});

describe('dial stack', () => {
  it('adding to a plain dial moves its own fields into entry 0', () => {
    const next = stackAddEntry({ label: 'a', action: { type: 'page' } });
    expect(next).toEqual({ stack: [{ label: 'a', action: { type: 'page' } }, {}] });
    expect(isDialStack(next)).toBe(true);
  });

  it('a one-entry stack is not a stack', () => {
    expect(isDialStack({ stack: [{ label: 'a' }] })).toBe(false);
    expect(shownDialEntry({ label: 'own', stack: [{ label: 'a' }] }).label).toBe('own');
  });

  it('adding past the cap is a no-op', () => {
    let dial = stackAddEntry({});
    for (let i = 0; i < 20; i++) dial = stackAddEntry(dial);
    expect(dial.stack).toHaveLength(MAX_DIAL_STACK);
  });

  it('removing down to one entry collapses to a plain dial', () => {
    const dial = { stack: [{ label: 'a' }, { label: 'b' }] };
    expect(stackRemoveEntry(dial, 0)).toEqual({ label: 'b' });
    expect(stackRemoveEntry({ stack: [{ label: 'a' }, { label: 'b' }, { label: 'c' }] }, 1)).toEqual({ stack: [{ label: 'a' }, { label: 'c' }] });
  });

  it('moves entries and ignores out-of-range moves', () => {
    const dial = { stack: [{ label: 'a' }, { label: 'b' }] };
    expect(stackMoveEntry(dial, 0, 1).stack?.map(e => e.label)).toEqual(['b', 'a']);
    expect(stackMoveEntry(dial, 0, -1)).toBe(dial);
    expect(stackMoveEntry(dial, 1, 1)).toBe(dial);
  });

  it('writes the edited entry, or the dial itself without a stack', () => {
    expect(writeDialEntry({ label: 'x' }, 0, { label: 'y' })).toEqual({ label: 'y' });
    expect(writeDialEntry({ stack: [{ label: 'a' }, { label: 'b' }] }, 1, { label: 'B' })).toEqual({ stack: [{ label: 'a' }, { label: 'B' }] });
  });

  it('dialIsEmpty looks at every stack entry', () => {
    expect(dialIsEmpty({})).toBe(true);
    expect(dialIsEmpty({ label: 'a' })).toBe(false);
    expect(dialIsEmpty({ stack: [{}, { label: 'b' }] })).toBe(false);
    expect(dialIsEmpty({ stack: [{}, {}] })).toBe(true);
  });
});

describe('model layout', () => {
  it('picks the arrangement from the capability fields', () => {
    expect(deckPreviewLayout({})).toBe('keys');
    expect(deckPreviewLayout({ encoders: 4, dialPlacement: 'below', screen: { width: 800, height: 100, kind: 'touchStrip' } })).toBe('dialsBelow');
    expect(deckPreviewLayout({ encoders: 2, dialPlacement: 'above', screen: { width: 720, height: 384, kind: 'dialScreen' } })).toBe('dialsAbove');
    expect(deckPreviewLayout({ encoders: 2, dialPlacement: 'sides', screen: null })).toBe('dialsSides');
    expect(deckPreviewLayout({ encoders: 0, touchKeys: 2, screen: { width: 248, height: 58, kind: 'infoScreen' } })).toBe('infoScreen');
  });

  it('key aspect is height over width, 1 when unknown', () => {
    expect(deckKeyAspect({ keyWidth: 144, keyHeight: 112 })).toBeCloseTo(112 / 144);
    expect(deckKeyAspect({})).toBe(1);
  });
});
