import { describe, it, expect } from 'vitest';
import { defaultCurveSourceId } from './tempSensorResolver';

// Mirrors the service FanProfiles.PreferredInput order so new/preset curves
// default to the CPU temp on every platform, never a motherboard channel.
describe('defaultCurveSourceId', () => {
  const linux = [
    // sources[0] is a motherboard SuperIO channel - the old (wrong) default.
    { id: 'linux-temp-it8696-it87-2624-1', name: 'it8696 temp1', category: 'Motherboard' },
    { id: 'linux-temp-k10temp-1', name: 'k10temp Tctl', category: 'CPU' },
  ];

  it('prefers a CPU-category source over sources[0]', () => {
    expect(defaultCurveSourceId(linux)).toBe('linux-temp-k10temp-1');
  });

  it('prefers a CPU source named "Package" (Intel/LHM)', () => {
    const intel = [
      { id: 'cpu-core-0', name: 'CPU Core #1', category: 'CPU' },
      { id: 'cpu-pkg', name: 'CPU Package', category: 'CPU' },
    ];
    expect(defaultCurveSourceId(intel)).toBe('cpu-pkg');
  });

  it('honors a pinned CPU source id when present in the list', () => {
    expect(defaultCurveSourceId(linux, 'linux-temp-it8696-it87-2624-1'))
      .toBe('linux-temp-it8696-it87-2624-1');
  });

  it('ignores a stale pinned id that no longer resolves', () => {
    expect(defaultCurveSourceId(linux, 'gone')).toBe('linux-temp-k10temp-1');
  });

  it('falls back to the first source when there is no CPU category', () => {
    const mobo = [{ id: 'm1', name: 'chipset', category: 'Motherboard' }];
    expect(defaultCurveSourceId(mobo)).toBe('m1');
  });

  it('returns empty string when there are no sources', () => {
    expect(defaultCurveSourceId([])).toBe('');
  });
});
