// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  innerGridForSize, normalizeDeckConfig, padSlots, resolveViewSlots, updateSlotAt, swapSlots, emptyDeck,
  defaultDeckConfig, deckConfigPatch, addPage, removePage, pageHasContent,
} from './deckLayout';
import { deckApp } from './index';
import type { DeckConfig } from './types';

describe('defaultDeckConfig', () => {
  it('seeds a new deck with volume up/down + open settings on a single page', () => {
    expect(defaultDeckConfig().pages).toHaveLength(1);
    expect(defaultDeckConfig().pages[0].slots.map(s => s.action)).toEqual([
      { type: 'system', action: { op: 'volumeUp' } },
      { type: 'system', action: { op: 'volumeDown' } },
      { type: 'system', action: { op: 'openSettings' } },
    ]);
  });

  it('manifest defaultConfig returns a fresh deck patch each call', () => {
    const a = deckApp.meta.defaultConfig?.();
    const b = deckApp.meta.defaultConfig?.();
    expect(a).toEqual(deckConfigPatch(defaultDeckConfig()));
    expect(a).not.toBe(b);
  });
});

describe('innerGridForSize', () => {
  it('maps sizes to inner grid counts', () => {
    expect(innerGridForSize('2x2')).toEqual({ cols: 2, rows: 2, count: 4 });
    expect(innerGridForSize('4x2')).toEqual({ cols: 4, rows: 2, count: 8 });
    expect(innerGridForSize('4x4')).toEqual({ cols: 4, rows: 4, count: 16 });
  });
});

describe('normalizeDeckConfig', () => {
  it('returns one empty page for junk input', () => {
    expect(normalizeDeckConfig(undefined).pages).toEqual([{ slots: [] }]);
    expect(normalizeDeckConfig({}).pages).toEqual([{ slots: [] }]);
    expect(emptyDeck().pages).toEqual([{ slots: [] }]);
  });

  it('migrates a legacy single-grid { slots } config to a single page', () => {
    const cfg = normalizeDeckConfig({ slots: [{ label: 'x' }] });
    expect(cfg.pages).toHaveLength(1);
    expect(cfg.pages[0].slots[0].label).toBe('x');
  });

  it('preserves a valid { pages } config', () => {
    const cfg = normalizeDeckConfig({ pages: [{ slots: [{ label: 'p0' }] }, { slots: [{ label: 'p1' }] }] });
    expect(cfg.pages).toHaveLength(2);
    expect(cfg.pages[0].slots[0].label).toBe('p0');
    expect(cfg.pages[1].slots[0].label).toBe('p1');
  });

  it('falls back to one empty page for an empty pages array', () => {
    expect(normalizeDeckConfig({ pages: [] }).pages).toEqual([{ slots: [] }]);
  });

  it('normalizes a junk page entry to an empty page', () => {
    const cfg = normalizeDeckConfig({ pages: [null, { slots: [{ label: 'ok' }] }] });
    expect(cfg.pages[0]).toEqual({ slots: [] });
    expect(cfg.pages[1].slots[0].label).toBe('ok');
  });

  it('round-trips a monitoring action through normalize/updateSlotAt/resolveViewSlots unchanged', () => {
    const monitoringAction = {
      type: 'monitoring' as const,
      category: 'cpu' as const,
      sensor: 'summary/cpu-usage',
      style: 'segments' as const,
      color: '#4da3ff',
      showName: true,
      press: 'taskManager' as const,
    };
    const cfg = normalizeDeckConfig({ pages: [{ slots: [{ action: monitoringAction }] }] });
    expect(cfg.pages[0].slots[0].action).toEqual(monitoringAction);

    const updated = updateSlotAt(cfg, 0, [], 0, { action: monitoringAction, label: 'CPU' }, 4);
    const view = resolveViewSlots(updated, 0, [], 4);
    expect(view![0].action).toEqual(monitoringAction);
    expect(view![0].label).toBe('CPU');
  });

  it('round-trips a monitoring action carrying the v3 fields (labelText, scale, min, max) unchanged', () => {
    const monitoringAction = {
      type: 'monitoring' as const,
      category: 'cpu' as const,
      sensor: 'summary/cpu-usage',
      style: 'line' as const,
      labelText: 'My CPU',
      scale: 'fixed' as const,
      min: 10,
      max: 90,
    };
    const cfg = normalizeDeckConfig({ pages: [{ slots: [{ action: monitoringAction }] }] });
    expect(cfg.pages[0].slots[0].action).toEqual(monitoringAction);
  });

  it('maps a legacy persisted "radial" monitoring style to "segments" on read', () => {
    const legacyAction = { type: 'monitoring', category: 'cpu', sensor: 'summary/cpu-usage', style: 'radial' };
    const cfg = normalizeDeckConfig({ pages: [{ slots: [{ action: legacyAction }] }] });
    expect(cfg.pages[0].slots[0].action).toEqual({ ...legacyAction, style: 'segments' });
  });

  it('maps a legacy "radial" style nested in a folder, a sequence step, and a toggle branch', () => {
    const legacyAction = { type: 'monitoring', category: 'cpu', sensor: 'summary/cpu-usage', style: 'radial' };
    const cfg = normalizeDeckConfig({
      pages: [{
        slots: [
          { folder: { slots: [{ action: legacyAction }] } },
          { action: { type: 'sequence', steps: [{ action: legacyAction }] } },
          { action: { type: 'toggle', on: legacyAction, off: legacyAction } },
        ],
      }],
    });
    const expected = { ...legacyAction, style: 'segments' };
    const [folderSlot, sequenceSlot, toggleSlot] = cfg.pages[0].slots;
    expect(folderSlot.folder!.slots[0].action).toEqual(expected);
    expect((sequenceSlot.action as { steps: { action: unknown }[] }).steps[0].action).toEqual(expected);
    expect(toggleSlot.action).toEqual({ type: 'toggle', on: expected, off: expected });
  });

  it('leaves a monitoring action with a current style unchanged', () => {
    const action = { type: 'monitoring', category: 'cpu', sensor: 'summary/cpu-usage', style: 'backdrop' };
    const cfg = normalizeDeckConfig({ pages: [{ slots: [{ action }] }] });
    expect(cfg.pages[0].slots[0].action).toEqual(action);
  });

  it('strips a legacy text action `paste` key on read so old configs keep loading', () => {
    const legacyText = { type: 'text', text: 'hi', paste: false };
    const cfg = normalizeDeckConfig({ pages: [{ slots: [{ action: legacyText }] }] });
    expect(cfg.pages[0].slots[0].action).toEqual({ type: 'text', text: 'hi' });
  });

  it('strips a legacy paste key nested in a folder, a sequence step, and a toggle branch', () => {
    const legacyText = { type: 'text', text: 'hi', paste: true };
    const cfg = normalizeDeckConfig({
      pages: [{
        slots: [
          { folder: { slots: [{ action: legacyText }] } },
          { action: { type: 'sequence', steps: [{ action: legacyText }] } },
          { action: { type: 'toggle', on: legacyText, off: legacyText } },
        ],
      }],
    });
    const [folderSlot, sequenceSlot, toggleSlot] = cfg.pages[0].slots;
    expect(folderSlot.folder!.slots[0].action).toEqual({ type: 'text', text: 'hi' });
    expect((sequenceSlot.action as { steps: { action: unknown }[] }).steps[0].action).toEqual({ type: 'text', text: 'hi' });
    expect(toggleSlot.action).toEqual({ type: 'toggle', on: { type: 'text', text: 'hi' }, off: { type: 'text', text: 'hi' } });
  });

  it('strips a legacy paste key through the pre-pagination { slots } migration path', () => {
    const cfg = normalizeDeckConfig({ slots: [{ action: { type: 'text', text: 'hi', paste: true } }] });
    expect(cfg.pages[0].slots[0].action).toEqual({ type: 'text', text: 'hi' });
  });

  it('leaves a text action with no paste key unchanged', () => {
    const cfg = normalizeDeckConfig({ pages: [{ slots: [{ action: { type: 'text', text: 'hi' } }] }] });
    expect(cfg.pages[0].slots[0].action).toEqual({ type: 'text', text: 'hi' });
  });
});

describe('padSlots', () => {
  it('pads to count with empty slots', () => {
    expect(padSlots([{ label: 'a' }], 4)).toHaveLength(4);
    expect(padSlots([{ label: 'a' }], 4)[3]).toEqual({});
  });
  it('truncates beyond count', () => {
    expect(padSlots([{}, {}, {}, {}, {}], 4)).toHaveLength(4);
  });
});

describe('resolveViewSlots', () => {
  const deck: DeckConfig = { pages: [{ slots: [{ folder: { slots: [{ label: 'inner' }] } }] }] };
  it('resolves top-level slots padded to count', () => {
    const slots = resolveViewSlots(deck, 0, [], 4);
    expect(slots).toHaveLength(4);
    expect(slots![0].folder).toBeTruthy();
  });
  it('drills into a folder path', () => {
    expect(resolveViewSlots(deck, 0, [0], 4)![0].label).toBe('inner');
  });
  it('returns null for an invalid folder path', () => {
    expect(resolveViewSlots(deck, 0, [1], 4)).toBeNull();
  });
  it('resolves slots on a non-zero page', () => {
    const twoPages: DeckConfig = { pages: [{ slots: [{ label: 'p0' }] }, { slots: [{ label: 'p1' }] }] };
    expect(resolveViewSlots(twoPages, 1, [], 4)![0].label).toBe('p1');
  });
  it('treats an out-of-range page as empty', () => {
    expect(resolveViewSlots(deck, 5, [], 4)).toHaveLength(4);
  });
});

describe('updateSlotAt', () => {
  it('replaces a top-level slot immutably on page 0', () => {
    const deck = emptyDeck();
    const next = updateSlotAt(deck, 0, [], 2, { label: 'set' }, 4);
    expect(next).not.toBe(deck);
    expect(next.pages[0].slots[2].label).toBe('set');
    expect(deck.pages[0].slots).toHaveLength(0); // original untouched
  });
  it('replaces a slot inside a folder', () => {
    const deck: DeckConfig = { pages: [{ slots: [{ folder: { slots: [] } }] }] };
    const next = updateSlotAt(deck, 0, [0], 1, { label: 'deep' }, 4);
    expect(next.pages[0].slots[0].folder!.slots[1].label).toBe('deep');
  });
  it('replaces a slot on a non-zero page without touching other pages', () => {
    const deck: DeckConfig = { pages: [{ slots: [{ label: 'p0' }] }, { slots: [] }] };
    const next = updateSlotAt(deck, 1, [], 0, { label: 'p1-set' }, 4);
    expect(next.pages[1].slots[0].label).toBe('p1-set');
    expect(next.pages[0].slots[0].label).toBe('p0');
  });
  it('clamps an out-of-range page index instead of creating sparse pages', () => {
    const deck: DeckConfig = { pages: [{ slots: [] }, { slots: [] }] };
    const next = updateSlotAt(deck, 5, [], 0, { label: 'clamped' }, 4);
    expect(next.pages).toHaveLength(2);
    expect(next.pages[1].slots[0].label).toBe('clamped');
  });
});

describe('swapSlots', () => {
  it('swaps two slots at the top level of page 0', () => {
    const deck: DeckConfig = { pages: [{ slots: [{ label: 'a' }, { label: 'b' }] }] };
    const next = swapSlots(deck, 0, [], 0, 1, 4);
    expect(next.pages[0].slots[0].label).toBe('b');
    expect(next.pages[0].slots[1].label).toBe('a');
  });
  it('is a no-op when from === to', () => {
    const deck = emptyDeck();
    expect(swapSlots(deck, 0, [], 1, 1, 4)).toBe(deck);
  });
  it('swaps slots on a non-zero page', () => {
    const deck: DeckConfig = { pages: [{ slots: [] }, { slots: [{ label: 'a' }, { label: 'b' }] }] };
    const next = swapSlots(deck, 1, [], 0, 1, 4);
    expect(next.pages[1].slots[0].label).toBe('b');
    expect(next.pages[1].slots[1].label).toBe('a');
  });
  it('clamps an out-of-range page index instead of creating sparse pages', () => {
    const deck: DeckConfig = { pages: [{ slots: [{ label: 'a' }, { label: 'b' }] }] };
    const next = swapSlots(deck, 9, [], 0, 1, 4);
    expect(next.pages).toHaveLength(1);
    expect(next.pages[0].slots[0].label).toBe('b');
    expect(next.pages[0].slots[1].label).toBe('a');
  });
});

describe('addPage / removePage / pageHasContent', () => {
  it('appends a fresh empty page', () => {
    const deck: DeckConfig = { pages: [{ slots: [{ label: 'a' }] }] };
    const next = addPage(deck);
    expect(next.pages).toHaveLength(2);
    expect(next.pages[1]).toEqual({ slots: [] });
    expect(next.pages[0]).toBe(deck.pages[0]); // untouched
  });

  it('removes the page at the given index', () => {
    const deck: DeckConfig = { pages: [{ slots: [{ label: 'a' }] }, { slots: [{ label: 'b' }] }] };
    const next = removePage(deck, 0);
    expect(next.pages).toHaveLength(1);
    expect(next.pages[0].slots[0].label).toBe('b');
  });

  it('is a no-op removing the last remaining page', () => {
    const deck: DeckConfig = { pages: [{ slots: [{ label: 'a' }] }] };
    expect(removePage(deck, 0)).toBe(deck);
  });

  it('pageHasContent is false for an all-empty page', () => {
    expect(pageHasContent({ slots: [{}, {}] })).toBe(false);
  });

  it('pageHasContent is true when a slot has an action, icon, or label', () => {
    expect(pageHasContent({ slots: [{ action: { type: 'hotkey', keys: 'a' } }] })).toBe(true);
    expect(pageHasContent({ slots: [{ icon: { kind: 'emoji', value: '🎮' } }] })).toBe(true);
    expect(pageHasContent({ slots: [{ label: 'x' }] })).toBe(true);
  });

  it('pageHasContent is true when a nested folder slot has content', () => {
    const page = { slots: [{ folder: { slots: [{ label: 'nested' }] } }] };
    expect(pageHasContent(page)).toBe(true);
  });
});
