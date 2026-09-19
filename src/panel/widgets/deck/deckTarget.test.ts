// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { makePresetDeckTarget, resolveTargetView, slotCountAtDepth, slotPathAt, type DeckTarget } from './deckTarget';
import type { DeckPresetFull } from '../../../api/deck';
import type { DeckConfig } from './types';

function preset(deck: DeckConfig, cols = 3, rows = 2): DeckPresetFull {
  return { id: 'p1', name: 'Preset', cols, rows, pageCount: deck.pages.length, deck };
}

// The preset's own authored grid, so fitToGrid is an identity chunk-wise -
// every test below that isn't specifically about fitting uses this so it
// exercises the same before/after behaviour as the pre-fitted-target code.
const IDENTITY_GRID = { cols: 3, rows: 2 };

describe('slotCountAtDepth', () => {
  it('widget targets hold the same count at every depth', () => {
    const t = { kind: 'widget' as const, keyCount: 8 };
    expect(slotCountAtDepth(t, 0)).toBe(8);
    expect(slotCountAtDepth(t, 1)).toBe(8);
    expect(slotCountAtDepth(t, 2)).toBe(8);
  });

  it('physical targets reserve a Back key at every depth >= 1', () => {
    const t = { kind: 'physical' as const, keyCount: 6 };
    expect(slotCountAtDepth(t, 0)).toBe(6);
    expect(slotCountAtDepth(t, 1)).toBe(5);
    expect(slotCountAtDepth(t, 2)).toBe(5);
  });

  it('clamps at zero for a 1-key physical deck (Pedal-class, no images anyway)', () => {
    expect(slotCountAtDepth({ kind: 'physical', keyCount: 1 }, 1)).toBe(0);
  });
});

describe('slotPathAt', () => {
  it('joins the folder chain and index with dots', () => {
    expect(slotPathAt([], 3)).toBe('3');
    expect(slotPathAt([2, 1], 5)).toBe('2.1.5');
  });
});

describe('makePresetDeckTarget - cols/rows/keyCount/config reflect the INSTANCE grid', () => {
  it('a same-size instance renders an identity fit (content unchanged, padded to keyCount)', () => {
    const target = makePresetDeckTarget(preset({ pages: [{ slots: [{ label: 'a' }] }] }), IDENTITY_GRID, 'widget', vi.fn());
    expect(target.kind).toBe('widget');
    expect(target.cols).toBe(3);
    expect(target.rows).toBe(2);
    expect(target.keyCount).toBe(6);
    expect(target.config.pages[0].slots).toHaveLength(6);
    expect(target.config.pages[0].slots[0].label).toBe('a');
  });

  it('a smaller instance grid renders the FITTED (not authored) size - what the user actually sees', () => {
    // Authored 3x2 (6 keys), instance only 2x2 (4 keys): no overflow here
    // (single slot fits), so cols/rows/keyCount/config all read as 2x2.
    const target = makePresetDeckTarget(preset({ pages: [{ slots: [{ label: 'a' }] }] }), { cols: 2, rows: 2 }, 'widget', vi.fn());
    expect(target.cols).toBe(2);
    expect(target.rows).toBe(2);
    expect(target.keyCount).toBe(4);
    expect(target.config.pages[0].slots).toHaveLength(4);
    expect(target.config.pages[0].slots[0].label).toBe('a');
  });
});

describe('makePresetDeckTarget - writes translate the fitted view back to the authored preset', () => {
  it('updateSlot saves the full updated tree (identity fit)', () => {
    const save = vi.fn();
    const target = makePresetDeckTarget(preset({ pages: [{ slots: [] }] }), IDENTITY_GRID, 'widget', save);
    target.updateSlot(0, [], 1, { label: 'x' });
    expect(save).toHaveBeenCalledTimes(1);
    const next = save.mock.calls[0][0] as DeckConfig;
    expect(next.pages[0].slots[1].label).toBe('x');
  });

  it('updateSlot writes into the given page only', () => {
    const save = vi.fn();
    const target = makePresetDeckTarget(
      preset({ pages: [{ slots: [{ label: 'p0' }] }, { slots: [] }] }), IDENTITY_GRID, 'widget', save,
    );
    target.updateSlot(1, [], 0, { label: 'p1' });
    const next = save.mock.calls[0][0] as DeckConfig;
    expect(next.pages[0].slots[0].label).toBe('p0');
    expect(next.pages[1].slots[0].label).toBe('p1');
  });

  it('swapSlots saves the swapped tree and is a no-op for from === to', () => {
    const save = vi.fn();
    const target = makePresetDeckTarget(
      preset({ pages: [{ slots: [{ label: 'a' }, { label: 'b' }] }] }), IDENTITY_GRID, 'widget', save,
    );
    target.swapSlots(0, [], 0, 1);
    expect(save).toHaveBeenCalledTimes(1);
    const next = save.mock.calls[0][0] as DeckConfig;
    expect(next.pages[0].slots[0].label).toBe('b');
    expect(next.pages[0].slots[1].label).toBe('a');
  });

  it('swapSlots is a no-op call when from === to (no save)', () => {
    const save = vi.fn();
    const target = makePresetDeckTarget(preset({ pages: [{ slots: [{ label: 'a' }] }] }), IDENTITY_GRID, 'physical', save);
    target.swapSlots(0, [], 0, 0);
    expect(save).not.toHaveBeenCalled();
  });

  it('addPage saves an appended AUTHORED empty page', () => {
    const save = vi.fn();
    const target = makePresetDeckTarget(preset({ pages: [{ slots: [{ label: 'a' }] }] }), IDENTITY_GRID, 'widget', save);
    target.addPage();
    const next = save.mock.calls[0][0] as DeckConfig;
    expect(next.pages).toHaveLength(2);
    expect(next.pages[1]).toEqual({ slots: [] });
  });

  it('removePage saves the deck with that page removed (identity fit: fitted page N is authored page N)', () => {
    const save = vi.fn();
    const target = makePresetDeckTarget(
      preset({ pages: [{ slots: [{ label: 'a' }] }, { slots: [{ label: 'b' }] }] }), IDENTITY_GRID, 'widget', save,
    );
    target.removePage(0);
    const next = save.mock.calls[0][0] as DeckConfig;
    expect(next.pages).toHaveLength(1);
    expect(next.pages[0].slots[0].label).toBe('b');
  });

  it('removePageKeyCount counts the authored page\'s bound keys (identity fit: fitted page N is authored page N)', () => {
    const target = makePresetDeckTarget(
      preset({ pages: [{ slots: [{ action: { type: 'openUrl', url: 'a' } }] }, { slots: [{ action: { type: 'openUrl', url: 'b' } }, { action: { type: 'openUrl', url: 'c' } }] }] }),
      IDENTITY_GRID, 'widget', vi.fn(),
    );
    expect(target.removePageKeyCount(0)).toBe(1);
    expect(target.removePageKeyCount(1)).toBe(2);
  });

  it('setTitleDefault saves the deck-wide default title style', () => {
    const save = vi.fn();
    const target = makePresetDeckTarget(preset({ pages: [{ slots: [] }] }), IDENTITY_GRID, 'widget', save);
    target.setTitleDefault({ show: true, bold: true });
    const next = save.mock.calls[0][0] as DeckConfig;
    expect(next.defaultTitleStyle).toEqual({ show: true, bold: true });
  });

  it('reserves a Back key when updating a slot inside a folder (physical kind)', () => {
    const config: DeckConfig = { pages: [{ slots: [{ folder: { slots: [{ label: 'inner' }] } }] }] };
    const save = vi.fn();
    const target = makePresetDeckTarget(preset(config), IDENTITY_GRID, 'physical', save);
    target.updateSlot(0, [0], 2, { label: 'set' });
    expect(save).toHaveBeenCalledTimes(1);
    const next = save.mock.calls[0][0] as DeckConfig;
    // Folder level holds keyCount-1 = 5 slots (6-key target); index 2 is in range.
    expect(next.pages[0].slots[0].folder!.slots[2].label).toBe('set');
  });
});

describe('makePresetDeckTarget - overflow (chunked) writes and read-only auto keys', () => {
  // Authored 3x3 (9 keys) on a 6-key instance chunks into 2 fitted pages:
  // fitted page 0 = authored[0..4] + auto-next; fitted page 1 = auto-prev + authored[5..8].
  function overflowPreset() {
    const slots = Array.from({ length: 9 }, (_, i) => ({ label: `k${i}` }));
    return preset({ pages: [{ slots }] }, 3, 3);
  }

  it('updateSlot on a content key in the second fitted page writes to its real authored index', () => {
    const save = vi.fn();
    const target = makePresetDeckTarget(overflowPreset(), { cols: 3, rows: 2 }, 'widget', save);
    // Fitted page 1, index 1 = authored slot 5 (index 0 there is the auto-prev key).
    target.updateSlot(1, [], 1, { label: 'edited' });
    expect(save).toHaveBeenCalledTimes(1);
    const next = save.mock.calls[0][0] as DeckConfig;
    expect(next.pages[0].slots[5].label).toBe('edited');
  });

  it('updateSlot on the synthesized auto-next key is a silent no-op', () => {
    const save = vi.fn();
    const target = makePresetDeckTarget(overflowPreset(), { cols: 3, rows: 2 }, 'widget', save);
    expect(target.config.pages[0].slots[5].auto).toBe(true);
    target.updateSlot(0, [], 5, { label: 'nope' });
    expect(save).not.toHaveBeenCalled();
  });

  it('swapSlots refuses to swap when either side is an auto key', () => {
    const save = vi.fn();
    const target = makePresetDeckTarget(overflowPreset(), { cols: 3, rows: 2 }, 'widget', save);
    target.swapSlots(0, [], 0, 5); // index 5 is the auto-next key
    expect(save).not.toHaveBeenCalled();
  });

  it('removePage(1) removes the authored page that produced fitted page 1 (same authored page as fitted page 0)', () => {
    const save = vi.fn();
    const secondAuthoredPage = { slots: [{ label: 'p1' }] };
    const bigPreset = preset({ pages: [{ slots: Array.from({ length: 9 }, (_, i) => ({ label: `k${i}` })) }, secondAuthoredPage] }, 3, 3);
    const target = makePresetDeckTarget(bigPreset, { cols: 3, rows: 2 }, 'widget', save);
    // 3 fitted pages total: 2 chunked from authored page 0, 1 from authored page 1.
    expect(target.config.pages).toHaveLength(3);
    target.removePage(1); // still chunked from authored page 0
    const next = save.mock.calls[0][0] as DeckConfig;
    expect(next.pages).toHaveLength(1);
    expect(next.pages[0].slots[0].label).toBe('p1');
  });

  it('removePageKeyCount reports the WHOLE authored page\'s key count on every fitted chunk of it, not just what that chunk shows', () => {
    const bound9 = { pages: [{ slots: Array.from({ length: 9 }, (_, i) => ({ action: { type: 'openUrl' as const, url: `u${i}` } })) }] };
    const bigPreset = preset(bound9, 3, 3);
    const target = makePresetDeckTarget(bigPreset, { cols: 3, rows: 2 }, 'widget', vi.fn());
    // Chunked into 2 fitted pages, both from the same 9-key authored page.
    expect(target.config.pages).toHaveLength(2);
    expect(target.removePageKeyCount(0)).toBe(9);
    expect(target.removePageKeyCount(1)).toBe(9);
  });
});

describe('makePresetDeckTarget - a write never truncates authored content past the fitted view', () => {
  it('editing a 2x2 preset whose page already grew to 12 real slots on a bigger deck keeps all 12 (repro A)', () => {
    const grownSlots = Array.from({ length: 12 }, (_, i) => ({ label: `k${i}` }));
    const grownPreset = preset({ pages: [{ slots: grownSlots }] }, 2, 2);
    const save = vi.fn();
    const target = makePresetDeckTarget(grownPreset, { cols: 2, rows: 2 }, 'widget', save);
    target.updateSlot(0, [], 1, { label: 'edited' });
    expect(save).toHaveBeenCalledTimes(1);
    const next = save.mock.calls[0][0] as DeckConfig;
    expect(next.pages[0].slots).toHaveLength(12);
    expect(next.pages[0].slots[1].label).toBe('edited');
    expect(next.pages[0].slots[11].label).toBe('k11');
  });

  it('editing inside a 10-key folder from a 2x2 widget keeps all 10 folder slots (repro B)', () => {
    const folderSlots = Array.from({ length: 10 }, (_, i) => ({ label: `f${i}` }));
    const bigPreset = preset({ pages: [{ slots: [{ folder: { slots: folderSlots } }] }] }, 4, 3);
    const save = vi.fn();
    const target = makePresetDeckTarget(bigPreset, { cols: 2, rows: 2 }, 'widget', save);
    target.updateSlot(0, [0], 2, { label: 'edited' });
    expect(save).toHaveBeenCalledTimes(1);
    const next = save.mock.calls[0][0] as DeckConfig;
    const folder = next.pages[0].slots[0].folder!;
    expect(folder.slots).toHaveLength(10);
    expect(folder.slots[2].label).toBe('edited');
    expect(folder.slots[9].label).toBe('f9');
  });
});

describe('resolveTargetView', () => {
  it('pads the root view to the physical target keyCount', () => {
    const target: DeckTarget = makePresetDeckTarget(preset({ pages: [{ slots: [{ label: 'a' }] }] }), IDENTITY_GRID, 'physical', vi.fn());
    const view = resolveTargetView(target, 0, []);
    expect(view).toHaveLength(6);
    expect(view![0].label).toBe('a');
  });

  it('pads a folder view to keyCount - 1 (Back reserved)', () => {
    const config: DeckConfig = { pages: [{ slots: [{ folder: { slots: [{ label: 'x' }] } }] }] };
    const target: DeckTarget = makePresetDeckTarget(preset(config), IDENTITY_GRID, 'physical', vi.fn());
    const view = resolveTargetView(target, 0, [0]);
    expect(view).toHaveLength(5);
    expect(view![0].label).toBe('x');
  });

  it('resolves the view for a non-zero page', () => {
    const config: DeckConfig = { pages: [{ slots: [{ label: 'p0' }] }, { slots: [{ label: 'p1' }] }] };
    const target: DeckTarget = makePresetDeckTarget(preset(config), IDENTITY_GRID, 'physical', vi.fn());
    const view = resolveTargetView(target, 1, []);
    expect(view![0].label).toBe('p1');
  });
});
