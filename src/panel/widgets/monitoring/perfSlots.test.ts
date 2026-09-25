// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  MICRO_MAX_COUNT,
  MICRO_MIN_COUNT,
  MICRO_WIDE_COUNTS,
  defaultSlotCountForSize,
  defaultSlotDesign,
  isExtrasBackedDevice,
  isMicroLayout,
  isTwoColumnMicro,
  isWideMicroCount,
  microSupportsSize,
  resolvedSlotCountForSize,
  slotCountOptionsForSize,
  HERO_SMALL_DESIGN_KEYS,
  designKeysForSlot,
  heroSpecForSize,
  heroSupportsSize,
  isFullBleedRound,
  isHeroLayout,
  resolveSlotDesign,
  resolvedSlotLayout,
  slotLayoutKey,
  slotLayoutOptionsForSize,
} from './perfSlots';
import { FRAME_FILLING_DESIGNS, GAUGE_DESIGN_KEYS } from './gauges';

describe('perfSlots', () => {
  describe('slotCountOptionsForSize', () => {
    it('exposes both Micro counts on 2x2 alongside the single-sensor option', () => {
      expect(slotCountOptionsForSize('2x2')).toEqual([1, MICRO_MIN_COUNT, MICRO_MAX_COUNT]);
    });

    it('exposes both Micro counts plus the wide 6/8 counts on 4x2 alongside 1 and 2', () => {
      expect(slotCountOptionsForSize('4x2')).toEqual([1, 2, MICRO_MIN_COUNT, MICRO_MAX_COUNT, ...MICRO_WIDE_COUNTS]);
    });

    it('does not expose Micro counts on 4x4 (count=4 there is the multi-sensor 2x2 grid)', () => {
      expect(slotCountOptionsForSize('4x4')).toEqual([2, 4]);
    });

    it('exposes the Micro counts (incl. wide 6/8) on the tall 2x4 alongside 2', () => {
      expect(slotCountOptionsForSize('2x4')).toEqual([2, MICRO_MIN_COUNT, MICRO_MAX_COUNT, ...MICRO_WIDE_COUNTS]);
    });
  });

  describe('microSupportsSize', () => {
    it('2x2, 4x2 and 2x4 support the Micro layout; 4x4 and 1x1 do not', () => {
      expect(microSupportsSize('2x2')).toBe(true);
      expect(microSupportsSize('4x2')).toBe(true);
      expect(microSupportsSize('2x4')).toBe(true);
      expect(microSupportsSize('4x4')).toBe(false);
      expect(microSupportsSize('1x1')).toBe(false);
    });
  });

  describe('isMicroLayout', () => {
    it('treats 3 and 4 as Micro on supported sizes', () => {
      expect(isMicroLayout('2x2', 3, false)).toBe(true);
      expect(isMicroLayout('2x2', 4, false)).toBe(true);
      expect(isMicroLayout('4x2', 3, false)).toBe(true);
      expect(isMicroLayout('4x2', 4, false)).toBe(true);
      expect(isMicroLayout('2x4', 3, false)).toBe(true);
      expect(isMicroLayout('2x4', 4, false)).toBe(true);
    });

    it('treats the wide 6/8 counts as Micro on the wide 4x2 and the tall 2x4', () => {
      expect(isMicroLayout('4x2', 6, false)).toBe(true);
      expect(isMicroLayout('4x2', 8, false)).toBe(true);
      expect(isMicroLayout('2x4', 6, false)).toBe(true);
      expect(isMicroLayout('2x4', 8, false)).toBe(true);
    });

    it('still treats count=4 on 4x4 as multi (not Micro)', () => {
      expect(isMicroLayout('4x4', 4, false)).toBe(false);
      expect(isMicroLayout('4x4', 2, false)).toBe(false);
    });

    it('rejects sub-Micro counts even on supported sizes', () => {
      expect(isMicroLayout('2x2', 1, false)).toBe(false);
      expect(isMicroLayout('4x2', 2, false)).toBe(false);
    });
  });

  describe('isTwoColumnMicro', () => {
    it('is true only for the wide 6/8 counts on the wide 4x2', () => {
      expect(isTwoColumnMicro('4x2', 6)).toBe(true);
      expect(isTwoColumnMicro('4x2', 8)).toBe(true);
      expect(isTwoColumnMicro('4x2', 3)).toBe(false);
      expect(isTwoColumnMicro('4x2', 4)).toBe(false);
      expect(isTwoColumnMicro('4x2', 2)).toBe(false);
    });

    it('is false on the tall 2x4 - it stacks 6/8 in a single column', () => {
      expect(isTwoColumnMicro('2x4', 6)).toBe(false);
      expect(isTwoColumnMicro('2x4', 8)).toBe(false);
      expect(isTwoColumnMicro('2x4', 3)).toBe(false);
    });
  });

  describe('isWideMicroCount', () => {
    it('is true only for the 6/8 counts, regardless of size', () => {
      expect(isWideMicroCount(6)).toBe(true);
      expect(isWideMicroCount(8)).toBe(true);
      expect(isWideMicroCount(3)).toBe(false);
      expect(isWideMicroCount(4)).toBe(false);
      expect(isWideMicroCount(2)).toBe(false);
    });
  });

  describe('defaultSlotCountForSize', () => {
    it('never returns a Micro count - existing widgets keep their pre-Micro defaults', () => {
      expect(defaultSlotCountForSize('2x2')).toBe(1);
      expect(defaultSlotCountForSize('4x2')).toBe(2);
      expect(defaultSlotCountForSize('4x4')).toBe(4);
      expect(defaultSlotCountForSize('2x4')).toBe(2);
      expect(defaultSlotCountForSize('1x1')).toBe(1);
    });
  });

  describe('resolvedSlotCountForSize', () => {
    it('returns the multi-sensor default when no count is configured', () => {
      expect(resolvedSlotCountForSize('2x2', undefined)).toBe(1);
      expect(resolvedSlotCountForSize('4x2', undefined)).toBe(2);
      expect(resolvedSlotCountForSize('4x4', undefined)).toBe(4);
    });

    it('preserves an explicit Micro count on supported sizes', () => {
      expect(resolvedSlotCountForSize('2x2', MICRO_MIN_COUNT)).toBe(MICRO_MIN_COUNT);
      expect(resolvedSlotCountForSize('2x2', MICRO_MAX_COUNT)).toBe(MICRO_MAX_COUNT);
      expect(resolvedSlotCountForSize('4x2', MICRO_MIN_COUNT)).toBe(MICRO_MIN_COUNT);
      expect(resolvedSlotCountForSize('4x2', MICRO_MAX_COUNT)).toBe(MICRO_MAX_COUNT);
    });

    it('preserves the wide 6/8 counts on 4x2 and 2x4 but rejects them on 2x2', () => {
      expect(resolvedSlotCountForSize('4x2', 6)).toBe(6);
      expect(resolvedSlotCountForSize('4x2', 8)).toBe(8);
      expect(resolvedSlotCountForSize('2x4', 6)).toBe(6);
      expect(resolvedSlotCountForSize('2x4', 8)).toBe(8);
      // 2x2 does not offer the wide counts -> falls back to its default.
      expect(resolvedSlotCountForSize('2x2', 6)).toBe(1);
      expect(resolvedSlotCountForSize('2x2', 8)).toBe(1);
    });

    it('clamps an invalid count to the size default rather than the legacy bounds', () => {
      // 4x4 has options [2, 4]; 3 is not valid -> default (4), not clamped to 2.
      expect(resolvedSlotCountForSize('4x4', 3)).toBe(4);
      // 4x2 has options [1, 2, 3, 4, 6, 8]; 5 and 7 are not valid -> default 2.
      expect(resolvedSlotCountForSize('4x2', 5)).toBe(2);
      expect(resolvedSlotCountForSize('4x2', 7)).toBe(2);
      // 2x2 has options [1, 3, 4]; 2 is not valid -> default 1.
      expect(resolvedSlotCountForSize('2x2', 2)).toBe(1);
    });
  });

  describe('isExtrasBackedDevice', () => {
    it('is true only for the extras-topic device categories', () => {
      expect(isExtrasBackedDevice('memoryModule')).toBe(true);
      expect(isExtrasBackedDevice('battery')).toBe(true);
      expect(isExtrasBackedDevice('cooler')).toBe(true);
      expect(isExtrasBackedDevice('psu')).toBe(true);
      expect(isExtrasBackedDevice('embeddedController')).toBe(true);
    });

    it('is false for every non-extras device, including the storage-topic smart category', () => {
      expect(isExtrasBackedDevice('cpu')).toBe(false);
      expect(isExtrasBackedDevice('storage')).toBe(false);
      expect(isExtrasBackedDevice('smart')).toBe(false);
      expect(isExtrasBackedDevice('motherboard')).toBe(false);
    });
  });
  describe('hero layout', () => {
    it('is offered on every multi-slot tile', () => {
      expect(heroSupportsSize('2x4')).toBe(true);
      expect(heroSupportsSize('2x2')).toBe(true);
      // The round glass lays out as 2x2.
      expect(heroSupportsSize('2x2round')).toBe(true);
      expect(heroSupportsSize('4x2')).toBe(true);
      expect(heroSupportsSize('4x4')).toBe(true);
    });

    it('sizes the hero per tile: 1+2 tall, 2+3 wide, 4+3 on 4x4', () => {
      expect(heroSpecForSize('2x4')).toEqual({ count: 3, large: 1 });
      expect(heroSpecForSize('2x2')).toEqual({ count: 3, large: 0 });
      expect(heroSpecForSize('4x2')).toEqual({ count: 5, large: 2 });
      expect(heroSpecForSize('4x4')).toEqual({ count: 7, large: 4 });
    });

    it('places one hero entry after the multi-sensor counts, before the Micro ones', () => {
      expect(slotLayoutOptionsForSize('2x4')).toEqual([
        { count: 2, hero: false },
        { count: 3, hero: true },
        { count: MICRO_MIN_COUNT, hero: false },
        { count: MICRO_MAX_COUNT, hero: false },
        { count: MICRO_WIDE_COUNTS[0], hero: false },
        { count: MICRO_WIDE_COUNTS[1], hero: false },
      ]);
      expect(slotLayoutOptionsForSize('2x2')).toEqual([
        { count: 1, hero: false },
        { count: 3, hero: true },
        { count: MICRO_MIN_COUNT, hero: false },
        { count: MICRO_MAX_COUNT, hero: false },
      ]);
      expect(slotLayoutOptionsForSize('4x2')).toEqual([
        { count: 1, hero: false },
        { count: 2, hero: false },
        { count: 5, hero: true },
        { count: MICRO_MIN_COUNT, hero: false },
        { count: MICRO_MAX_COUNT, hero: false },
        { count: MICRO_WIDE_COUNTS[0], hero: false },
        { count: MICRO_WIDE_COUNTS[1], hero: false },
      ]);
      expect(slotLayoutOptionsForSize('4x4')).toEqual([
        { count: 2, hero: false },
        { count: 4, hero: false },
        { count: 7, hero: true },
      ]);
    });

    it('keys the picker entries apart at the shared count', () => {
      expect(slotLayoutKey({ count: 3, hero: false })).toBe('3');
      expect(slotLayoutKey({ count: 3, hero: true })).toBe('hero3');
    });

    it('takes count 3 away from Micro only when the hero flag is set', () => {
      expect(isMicroLayout('2x4', 3, false)).toBe(true);
      expect(isMicroLayout('2x4', 3, true)).toBe(false);
      expect(isHeroLayout('2x4', 3, true)).toBe(true);
      // The flag alone is not enough: the count and the size both have to fit.
      expect(isHeroLayout('2x4', 4, true)).toBe(false);
      expect(isHeroLayout('4x2', 3, true)).toBe(false);
      expect(isHeroLayout('4x2', 5, true)).toBe(true);
      expect(isHeroLayout('4x4', 7, true)).toBe(true);
      expect(isHeroLayout('4x4', 5, true)).toBe(false);
    });

    it('drops the hero flag when the size cannot hold the layout', () => {
      expect(resolvedSlotLayout('2x4', { slotCount: 3, slotHero: true })).toEqual({ count: 3, hero: true });
      expect(resolvedSlotLayout('2x4', { slotCount: 3 })).toEqual({ count: 3, hero: false });
      // 4x4 has no count-3 option at all, so the count resolves to its default
      // and the hero flag cannot survive.
      expect(resolvedSlotLayout('4x4', { slotCount: 3, slotHero: true })).toEqual({ count: 4, hero: false });
      expect(resolvedSlotLayout('4x2', { slotCount: 3, slotHero: true })).toEqual({ count: 3, hero: false });
    });

    it('resolves the wide and grid hero counts only with the flag', () => {
      expect(resolvedSlotLayout('4x2', { slotCount: 5, slotHero: true })).toEqual({ count: 5, hero: true });
      expect(resolvedSlotLayout('4x4', { slotCount: 7, slotHero: true })).toEqual({ count: 7, hero: true });
      expect(resolvedSlotLayout('4x2', { slotCount: 5 })).toEqual({ count: 2, hero: false });
      // A resize carries the stored pair to a size whose hero count differs.
      expect(resolvedSlotLayout('2x4', { slotCount: 5, slotHero: true })).toEqual({ count: 2, hero: false });
      expect(resolvedSlotLayout('4x4', { slotCount: 5, slotHero: true })).toEqual({ count: 4, hero: false });
    });
  });

  describe('designKeysForSlot', () => {
    it('narrows the hero small cells to the value-first designs', () => {
      const hero = { count: 3, hero: true };
      expect(designKeysForSlot('2x4', hero, 0)).toEqual(GAUGE_DESIGN_KEYS);
      expect(designKeysForSlot('2x4', hero, 1)).toEqual(HERO_SMALL_DESIGN_KEYS);
      expect(designKeysForSlot('2x4', hero, 2)).toEqual(HERO_SMALL_DESIGN_KEYS);
    });

    it('keeps every design on the wide and grid hero large slots', () => {
      const wide = { count: 5, hero: true };
      expect(designKeysForSlot('4x2', wide, 1)).toEqual(GAUGE_DESIGN_KEYS);
      expect(designKeysForSlot('4x2', wide, 2)).toEqual(HERO_SMALL_DESIGN_KEYS);
      expect(designKeysForSlot('4x2', wide, 4)).toEqual(HERO_SMALL_DESIGN_KEYS);
      const grid = { count: 7, hero: true };
      expect(designKeysForSlot('4x4', grid, 3)).toEqual(GAUGE_DESIGN_KEYS);
      expect(designKeysForSlot('4x4', grid, 4)).toEqual(HERO_SMALL_DESIGN_KEYS);
      expect(designKeysForSlot('4x4', grid, 6)).toEqual(HERO_SMALL_DESIGN_KEYS);
    });

    it('narrows every 2x2 hero cell, the top one included', () => {
      const hero = { count: 3, hero: true };
      expect(designKeysForSlot('2x2', hero, 0)).toEqual(HERO_SMALL_DESIGN_KEYS);
      expect(designKeysForSlot('2x2', hero, 1)).toEqual(HERO_SMALL_DESIGN_KEYS);
    });

    it('offers the same design list on the round glass as anywhere else', () => {
      expect(designKeysForSlot('2x2round', { count: 1, hero: false }, 0)).toEqual(GAUGE_DESIGN_KEYS);
      expect(designKeysForSlot('2x2', { count: 1, hero: false }, 0)).toEqual(GAUGE_DESIGN_KEYS);
      expect(designKeysForSlot('4x4', { count: 4, hero: false }, 0)).toEqual(GAUGE_DESIGN_KEYS);
    });

    it('has no design outside the shared list', () => {
      for (const key of FRAME_FILLING_DESIGNS) expect(GAUGE_DESIGN_KEYS).toContain(key);
    });
  });

  describe('resolveSlotDesign', () => {
    it('clamps a design the slot no longer offers to the first allowed one', () => {
      const hero = { count: 3, hero: true };
      expect(resolveSlotDesign('2x4', hero, 1, 'sparkline')).toBe(HERO_SMALL_DESIGN_KEYS[0]);
      expect(resolveSlotDesign('2x4', hero, 1, 'numberfill')).toBe('numberfill');
    });

    it('leaves an allowed design alone', () => {
      expect(resolveSlotDesign('4x4', { count: 4, hero: false }, 0, 'sparkline')).toBe('sparkline');
      expect(resolveSlotDesign('2x2round', { count: 1, hero: false }, 0, 'caterpillar')).toBe('caterpillar');
    });
  });

  describe('defaultSlotDesign', () => {
    it('is the filled line for CPU usage on every rectangular size', () => {
      for (const size of ['2x2', '4x2', '2x4', '4x4'] as const) {
        expect(defaultSlotDesign(size, 0)).toBe('sparkline');
      }
      expect(defaultSlotDesign('4x4', 1)).toBe('halfgauge');
      expect(defaultSlotDesign('4x4', 2)).toBe('sparkline');
    });

    it('is the ring only on the round glass', () => {
      expect(defaultSlotDesign('2x2round', 0)).toBe('caterpillar');
    });
  });

  describe('isFullBleedRound', () => {
    it('is true only for a single-slot round tile on a frame-filling design', () => {
      expect(isFullBleedRound('2x2round', { slotCount: 1, slot0_design: 'caterpillar' })).toBe(true);
      expect(isFullBleedRound('2x2round', { slotCount: 1, slot0_design: 'waterLevel' })).toBe(true);
      expect(isFullBleedRound('2x2round', { slotCount: 1, slot0_design: 'arc270' })).toBe(true);
      expect(isFullBleedRound('2x2round', { slotCount: 1, slot0_design: 'backdrop' })).toBe(true);
      // A figure stacked above an info row cannot reach the frame by scaling.
      expect(isFullBleedRound('2x2round', { slotCount: 1, slot0_design: 'halfgauge' })).toBe(false);
      expect(isFullBleedRound('2x2round', { slotCount: 1, slot0_design: 'wedge' })).toBe(false);
      expect(isFullBleedRound('2x2round', { slotCount: 1, slot0_design: 'dial' })).toBe(false);
      // A rectangular layout at the full diameter would run off the arc.
      expect(isFullBleedRound('2x2round', { slotCount: 1, slot0_design: 'sparkline' })).toBe(false);
      expect(isFullBleedRound('2x2round', { slotCount: 1, slot0_design: 'text' })).toBe(false);
      expect(isFullBleedRound('2x2round', { slotCount: 4, slot0_design: 'caterpillar' })).toBe(false);
      // Only the round tile scales a design up; a square 2x2 is unchanged.
      expect(isFullBleedRound('2x2', { slotCount: 1, slot0_design: 'caterpillar' })).toBe(false);
    });

    it('is true for a round tile that has never been configured, since the default fills the frame', () => {
      expect(isFullBleedRound('2x2round', undefined)).toBe(true);
    });
  });
});
