import { describe, expect, it } from 'vitest';
import type { SystemSpecs } from '../../../hooks/useSystemSpecs';
import { buildSpecRows, coolerNames, sizeShowsSpecs } from './buildSpecRows';

const specs: SystemSpecs = {
  pcName: 'PC', osBuild: '', processor: 'AMD Ryzen 7 9800X3D', motherboard: 'Gigabyte B850I AORUS PRO',
  memory: '32 GB DDR5-5600', storage: '1.82 TB NVMe', graphicsCard: 'AMD Radeon(TM) Graphics + NVIDIA GeForce RTX 5080',
  primaryGpu: 'NVIDIA GeForce RTX 5080', monitor: '', soundCard: '', networkCard: '',
};

describe('buildSpecRows', () => {
  it('4x2 lists processor, graphics card and memory', () => {
    expect(buildSpecRows({ specs, coolers: [] }, '4x2').map((r) => r.key)).toEqual(['cpu', 'gpu', 'ram']);
  });

  it('4x4 adds storage, board and cooler where reported', () => {
    expect(buildSpecRows({ specs, coolers: ['Corsair H150i'] }, '4x4').map((r) => r.key)).toEqual(['cpu', 'gpu', 'ram', 'storage', 'motherboard', 'cooler']);
    expect(buildSpecRows({ specs, coolers: [] }, '4x4').map((r) => r.key)).toEqual(['cpu', 'gpu', 'ram', 'storage', 'motherboard']);
  });

  it('names the card that renders games, not the integrated one', () => {
    expect(buildSpecRows({ specs, coolers: [] }, '4x2')[1].value).toBe('NVIDIA GeForce RTX 5080');
    expect(buildSpecRows({ specs: { ...specs, primaryGpu: undefined }, coolers: [] }, '4x2')[1].value).toContain('Radeon');
  });

  it('lists nothing for the image-only size or before the specs arrive', () => {
    expect(buildSpecRows({ specs, coolers: [] }, '2x2')).toEqual([]);
    expect(buildSpecRows({ specs: null, coolers: [] }, '4x4')).toEqual([]);
  });

  it('skips a blank spec', () => {
    expect(buildSpecRows({ specs: { ...specs, memory: '  ' }, coolers: [] }, '4x2').map((r) => r.key)).toEqual(['cpu', 'gpu']);
  });

  it('sizeShowsSpecs matches the sizes that list rows', () => {
    expect(['2x2', '4x2', '4x4'].map(sizeShowsSpecs)).toEqual([false, true, true]);
  });
});

describe('coolerNames', () => {
  it('joins vendor and model once and drops other categories and duplicates', () => {
    expect(coolerNames([
      { category: 'cooler', vendor: 'Corsair', model: 'H150i' },
      { category: 'cooler', vendor: 'Corsair', model: 'Corsair H150i' },
      { category: 'cooler', vendor: 'Corsair', model: 'Corsair H150i' },
      { category: 'mouse', vendor: 'Corsair', model: 'M65' },
    ])).toEqual(['Corsair H150i']);
  });
});
