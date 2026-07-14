import { describe, it, expect, vi } from 'vitest';
import {
  computeDeckUploadJobs, deckImageSlotPath, makePhysicalDeckTarget, makeWidgetDeckTarget, resolveTargetView, slotCountAtDepth,
  type DeckTarget,
} from './deckTarget';
import type { PanelWidget } from '../types';
import type { DeckConfig, DeckSlot } from './types';

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

describe('makeWidgetDeckTarget', () => {
  function widgetWith(deck: DeckConfig): PanelWidget {
    return { id: 'w1', type: 'deck', size: '2x2', config: { deck: deck as unknown } } as unknown as PanelWidget;
  }

  it('reads the widget config and exposes the size-derived grid', () => {
    const widget = widgetWith({ pages: [{ slots: [{ label: 'a' }] }] });
    const onUpdate = vi.fn();
    const target = makeWidgetDeckTarget(widget, onUpdate);
    expect(target.kind).toBe('widget');
    expect(target.cols).toBe(2);
    expect(target.rows).toBe(2);
    expect(target.keyCount).toBe(4);
    expect(target.config.pages[0].slots[0].label).toBe('a');
  });

  it('updateSlot patches config.deck with the full updated tree', () => {
    const widget = widgetWith({ pages: [{ slots: [] }] });
    const onUpdate = vi.fn();
    const target = makeWidgetDeckTarget(widget, onUpdate);
    target.updateSlot(0, [], 1, { label: 'x' });
    expect(onUpdate).toHaveBeenCalledTimes(1);
    const patch = onUpdate.mock.calls[0][0] as { deck: DeckConfig };
    expect(patch.deck.pages[0].slots[1].label).toBe('x');
  });

  it('updateSlot writes into the given page only', () => {
    const widget = widgetWith({ pages: [{ slots: [{ label: 'p0' }] }, { slots: [] }] });
    const onUpdate = vi.fn();
    const target = makeWidgetDeckTarget(widget, onUpdate);
    target.updateSlot(1, [], 0, { label: 'p1' });
    const patch = onUpdate.mock.calls[0][0] as { deck: DeckConfig };
    expect(patch.deck.pages[0].slots[0].label).toBe('p0');
    expect(patch.deck.pages[1].slots[0].label).toBe('p1');
  });

  it('swapSlots patches with the swapped tree and is a no-op for from === to', () => {
    const widget = widgetWith({ pages: [{ slots: [{ label: 'a' }, { label: 'b' }] }] });
    const onUpdate = vi.fn();
    const target = makeWidgetDeckTarget(widget, onUpdate);
    target.swapSlots(0, [], 0, 1);
    expect(onUpdate).toHaveBeenCalledTimes(1);
    const patch = onUpdate.mock.calls[0][0] as { deck: DeckConfig };
    expect(patch.deck.pages[0].slots[0].label).toBe('b');
    expect(patch.deck.pages[0].slots[1].label).toBe('a');
  });

  it('addPage patches config.deck with an appended empty page', () => {
    const widget = widgetWith({ pages: [{ slots: [{ label: 'a' }] }] });
    const onUpdate = vi.fn();
    const target = makeWidgetDeckTarget(widget, onUpdate);
    target.addPage();
    const patch = onUpdate.mock.calls[0][0] as { deck: DeckConfig };
    expect(patch.deck.pages).toHaveLength(2);
    expect(patch.deck.pages[1]).toEqual({ slots: [] });
  });

  it('removePage patches config.deck with the page removed', () => {
    const widget = widgetWith({ pages: [{ slots: [{ label: 'a' }] }, { slots: [{ label: 'b' }] }] });
    const onUpdate = vi.fn();
    const target = makeWidgetDeckTarget(widget, onUpdate);
    target.removePage(0);
    const patch = onUpdate.mock.calls[0][0] as { deck: DeckConfig };
    expect(patch.deck.pages).toHaveLength(1);
    expect(patch.deck.pages[0].slots[0].label).toBe('b');
  });
});

describe('makePhysicalDeckTarget', () => {
  it('reserves a Back key when updating a slot inside a folder', () => {
    const config: DeckConfig = { pages: [{ slots: [{ folder: { slots: [{ label: 'inner' }] } }] }] };
    const persist = vi.fn();
    const target = makePhysicalDeckTarget(3, 2, 6, config, persist);
    target.updateSlot(0, [0], 2, { label: 'set' });
    expect(persist).toHaveBeenCalledTimes(1);
    const next = persist.mock.calls[0][0] as DeckConfig;
    // Folder level holds keyCount-1 = 5 slots; index 2 is in range.
    expect(next.pages[0].slots[0].folder!.slots[2].label).toBe('set');
  });

  it('swapSlots is a no-op call when from === to (no persist)', () => {
    const config: DeckConfig = { pages: [{ slots: [{ label: 'a' }] }] };
    const persist = vi.fn();
    const target = makePhysicalDeckTarget(3, 2, 6, config, persist);
    target.swapSlots(0, [], 0, 0);
    expect(persist).not.toHaveBeenCalled();
  });

  it('addPage persists an appended empty page', () => {
    const config: DeckConfig = { pages: [{ slots: [{ label: 'a' }] }] };
    const persist = vi.fn();
    const target = makePhysicalDeckTarget(3, 2, 6, config, persist);
    target.addPage();
    const next = persist.mock.calls[0][0] as DeckConfig;
    expect(next.pages).toHaveLength(2);
  });

  it('removePage persists the deck with that page removed', () => {
    const config: DeckConfig = { pages: [{ slots: [{ label: 'a' }] }, { slots: [{ label: 'b' }] }] };
    const persist = vi.fn();
    const target = makePhysicalDeckTarget(3, 2, 6, config, persist);
    target.removePage(1);
    const next = persist.mock.calls[0][0] as DeckConfig;
    expect(next.pages).toHaveLength(1);
    expect(next.pages[0].slots[0].label).toBe('a');
  });
});

describe('resolveTargetView', () => {
  it('pads the root view to the physical target keyCount', () => {
    const target: DeckTarget = makePhysicalDeckTarget(3, 2, 6, { pages: [{ slots: [{ label: 'a' }] }] }, vi.fn());
    const view = resolveTargetView(target, 0, []);
    expect(view).toHaveLength(6);
    expect(view![0].label).toBe('a');
  });

  it('pads a folder view to keyCount - 1 (Back reserved)', () => {
    const config: DeckConfig = { pages: [{ slots: [{ folder: { slots: [{ label: 'x' }] } }] }] };
    const target: DeckTarget = makePhysicalDeckTarget(3, 2, 6, config, vi.fn());
    const view = resolveTargetView(target, 0, [0]);
    expect(view).toHaveLength(5);
    expect(view![0].label).toBe('x');
  });

  it('resolves the view for a non-zero page', () => {
    const config: DeckConfig = { pages: [{ slots: [{ label: 'p0' }] }, { slots: [{ label: 'p1' }] }] };
    const target: DeckTarget = makePhysicalDeckTarget(3, 2, 6, config, vi.fn());
    const view = resolveTargetView(target, 1, []);
    expect(view![0].label).toBe('p1');
  });
});

describe('deckImageSlotPath', () => {
  it('prepends the page to the dot-joined folder/slot chain (DeckConfigNavigation grammar)', () => {
    expect(deckImageSlotPath(0, '3')).toBe('0.3');
    expect(deckImageSlotPath(2, '1.5')).toBe('2.1.5');
  });
});

describe('computeDeckUploadJobs', () => {
  function physicalTarget(config: DeckConfig, keyCount = 6): Pick<DeckTarget, 'kind' | 'keyCount' | 'config'> {
    return { kind: 'physical', keyCount, config };
  }

  it('emits one job per non-toggle slot at state 0, for the page it lives on', () => {
    const config: DeckConfig = { pages: [{ slots: [{ label: 'a' }, {}] }] };
    const jobs = computeDeckUploadJobs(physicalTarget(config, 2));
    expect(jobs).toEqual([
      { page: 0, slotPath: '0', state: 0, slot: { label: 'a' } },
      { page: 0, slotPath: '1', state: 0, slot: {} },
    ]);
  });

  it('emits both states for a toggle slot, each resolved to its branch', () => {
    const toggleSlot: DeckSlot = {
      action: {
        type: 'toggle',
        on: { type: 'system', action: { op: 'muteToggle' } },
        off: { type: 'system', action: { op: 'muteToggle' } },
        state: { kind: 'mute' },
      },
    };
    const config: DeckConfig = { pages: [{ slots: [{}, {}, toggleSlot] }] };
    const jobs = computeDeckUploadJobs(physicalTarget(config, 3));
    const toggleJobs = jobs.filter(j => j.slotPath === '2');
    expect(toggleJobs).toHaveLength(2);
    expect(toggleJobs[0]).toMatchObject({ page: 0, slotPath: '2', state: 0 });
    expect(toggleJobs[1]).toMatchObject({ page: 0, slotPath: '2', state: 1 });
    // Both states get an auto icon/color derived from the (identical) branches.
    expect(toggleJobs[0].slot.icon).toBeTruthy();
    expect(toggleJobs[1].slot.icon).toBeTruthy();
  });

  it('skips monitoring slots entirely, on every page (the service renders those keys itself)', () => {
    const monitoringSlot: DeckSlot = { action: { type: 'monitoring', category: 'cpu', sensor: 'x', style: 'line' } };
    const config: DeckConfig = {
      pages: [
        { slots: [monitoringSlot, { label: 'kept-0' }] },
        { slots: [monitoringSlot, { label: 'kept-1' }] },
      ],
    };
    const jobs = computeDeckUploadJobs(physicalTarget(config, 2));
    expect(jobs.some(j => j.slot.action?.type === 'monitoring')).toBe(false);
    expect(jobs).toEqual(expect.arrayContaining([
      expect.objectContaining({ page: 0, slotPath: '1', slot: expect.objectContaining({ label: 'kept-0' }) }),
      expect.objectContaining({ page: 1, slotPath: '1', slot: expect.objectContaining({ label: 'kept-1' }) }),
    ]));
  });

  it('skips weather slots entirely, on every page (the service renders those keys itself)', () => {
    const weatherSlot: DeckSlot = { action: { type: 'weather', units: 'auto' } };
    const config: DeckConfig = {
      pages: [
        { slots: [weatherSlot, { label: 'kept-0' }] },
        { slots: [weatherSlot, { label: 'kept-1' }] },
      ],
    };
    const jobs = computeDeckUploadJobs(physicalTarget(config, 2));
    expect(jobs.some(j => j.slot.action?.type === 'weather')).toBe(false);
    expect(jobs).toEqual(expect.arrayContaining([
      expect.objectContaining({ page: 0, slotPath: '1', slot: expect.objectContaining({ label: 'kept-0' }) }),
      expect.objectContaining({ page: 1, slotPath: '1', slot: expect.objectContaining({ label: 'kept-1' }) }),
    ]));
  });

  it('recurses into nested folders, threading the folder chain through slotPath at every depth', () => {
    const config: DeckConfig = {
      pages: [{
        slots: [{ folder: { slots: [{ folder: { slots: [{ label: 'deep' }] } }] } }],
      }],
    };
    const jobs = computeDeckUploadJobs(physicalTarget(config));
    const deep = jobs.find(j => j.slot.label === 'deep');
    expect(deep).toMatchObject({ page: 0, slotPath: '0.0.0' });
    expect(deckImageSlotPath(deep!.page, deep!.slotPath)).toBe('0.0.0.0');
  });

  it('page-qualifies keys so the same slot index reused across pages does not collide', () => {
    const config: DeckConfig = { pages: [{ slots: [{ label: 'a' }] }, { slots: [{ label: 'b' }] }] };
    const jobs = computeDeckUploadJobs(physicalTarget(config, 1));
    const keys = jobs.map(j => `${deckImageSlotPath(j.page, j.slotPath)}/${j.state}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toEqual(expect.arrayContaining(['0.0/0', '1.0/0']));
  });

  it("bakes each page's own page-indicator label, not whichever page is currently navigated", () => {
    const config: DeckConfig = {
      pages: [
        { slots: [{ action: { type: 'pageIndicator' } }] },
        { slots: [{ action: { type: 'pageIndicator' } }] },
      ],
    };
    const jobs = computeDeckUploadJobs(physicalTarget(config, 1));
    expect(jobs.find(j => j.page === 0)?.slot.label).toBe('1/2');
    expect(jobs.find(j => j.page === 1)?.slot.label).toBe('2/2');
  });
});
