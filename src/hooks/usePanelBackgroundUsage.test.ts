// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { buildUsage } from './usePanelBackgroundUsage';
import type { PanelDeviceRecord } from '../api/panel';

const dev = (over: Partial<PanelDeviceRecord>): PanelDeviceRecord =>
  ({ id: 'x', displayName: 'x', ...over }) as PanelDeviceRecord;

describe('buildUsage', () => {
  it('tallies shader backgrounds by effect and slot', () => {
    const u = buildUsage([
      dev({ id: 'a', backgroundMode: 'shader', backgroundEffect: 'plasma', backgroundTemplate: 3 }),
      dev({ id: 'b', backgroundMode: 'shader', backgroundEffect: 'fire', backgroundTemplate: 1 }),
    ]);
    expect([...u.effects].sort()).toEqual(['fire', 'plasma']);
    expect([...(u.slotsByEffect.get('plasma') ?? [])]).toEqual([3]);
  });

  it('ignores solid-mode panels', () => {
    const u = buildUsage([dev({ id: 'a', backgroundMode: 'solid', backgroundEffect: 'plasma', backgroundTemplate: 3 })]);
    expect(u.effects.size).toBe(0);
  });

  it('excludes the panel being edited so its own background never badges itself', () => {
    const devices = [
      dev({ id: 'self', backgroundMode: 'shader', backgroundEffect: 'plasma', backgroundTemplate: 3 }),
      dev({ id: 'other', backgroundMode: 'shader', backgroundEffect: 'matrix', backgroundTemplate: 0 }),
    ];
    const u = buildUsage(devices, 'self');
    expect(u.effects.has('plasma')).toBe(false); // self excluded
    expect(u.effects.has('matrix')).toBe(true);  // another panel still counts
  });

  it('keeps the effect when a second panel shares the excluded one', () => {
    const devices = [
      dev({ id: 'self', backgroundMode: 'shader', backgroundEffect: 'plasma', backgroundTemplate: 3 }),
      dev({ id: 'other', backgroundMode: 'shader', backgroundEffect: 'plasma', backgroundTemplate: 3 }),
    ];
    const u = buildUsage(devices, 'self');
    expect(u.effects.has('plasma')).toBe(true); // another panel also on plasma-3
    expect([...(u.slotsByEffect.get('plasma') ?? [])]).toEqual([3]);
  });
});
