import { describe, expect, it } from 'vitest';
import {
  MICRO_MAX_COUNT,
  MICRO_MIN_COUNT,
  MICRO_WIDE_COUNTS,
  defaultSlotCountForSize,
  isExtrasBackedDevice,
  isMicroLayout,
  isTwoColumnMicro,
  isWideMicroCount,
  microSupportsSize,
  resolvedSlotCountForSize,
  slotCountOptionsForSize,
} from './perfSlots';

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
      expect(isMicroLayout('2x2', 3)).toBe(true);
      expect(isMicroLayout('2x2', 4)).toBe(true);
      expect(isMicroLayout('4x2', 3)).toBe(true);
      expect(isMicroLayout('4x2', 4)).toBe(true);
      expect(isMicroLayout('2x4', 3)).toBe(true);
      expect(isMicroLayout('2x4', 4)).toBe(true);
    });

    it('treats the wide 6/8 counts as Micro on the wide 4x2 and the tall 2x4', () => {
      expect(isMicroLayout('4x2', 6)).toBe(true);
      expect(isMicroLayout('4x2', 8)).toBe(true);
      expect(isMicroLayout('2x4', 6)).toBe(true);
      expect(isMicroLayout('2x4', 8)).toBe(true);
    });

    it('still treats count=4 on 4x4 as multi (not Micro)', () => {
      expect(isMicroLayout('4x4', 4)).toBe(false);
      expect(isMicroLayout('4x4', 2)).toBe(false);
    });

    it('rejects sub-Micro counts even on supported sizes', () => {
      expect(isMicroLayout('2x2', 1)).toBe(false);
      expect(isMicroLayout('4x2', 2)).toBe(false);
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
});
