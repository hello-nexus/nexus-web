// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { publicSpecRows, withoutIntegratedGpus } from './publicProfileUtils';

describe('publicSpecRows', () => {
  it('orders rows identity -> OS -> core silicon -> memory -> storage -> display -> audio -> network', () => {
    const rows = publicSpecRows({
      networkCard: 'Intel Wi-Fi 6E',
      pcName: 'DESKTOP-NOVA',
      soundCard: 'Realtek ALC1220',
      processor: 'Ryzen 9 9800X3D',
      osBuild: 'Windows 11 24H2',
    });
    expect(rows.map(r => r.key)).toEqual(['pcName', 'osBuild', 'processor', 'soundCard', 'networkCard']);
  });

  it('drops fields absent from the response (the API returns any subset)', () => {
    const rows = publicSpecRows({ pcName: 'DESKTOP-NOVA' });
    expect(rows).toEqual([{ key: 'pcName', labelKey: 'devices.specs.row.pcName', value: 'DESKTOP-NOVA' }]);
  });

  it('drops empty-string values', () => {
    const rows = publicSpecRows({ pcName: 'DESKTOP-NOVA', motherboard: '' });
    expect(rows.map(r => r.key)).toEqual(['pcName']);
  });

  it('ignores unknown keys outside the canonical field set', () => {
    const rows = publicSpecRows({ pcName: 'DESKTOP-NOVA', unknownField: 'value' });
    expect(rows.map(r => r.key)).toEqual(['pcName']);
  });

  it('returns an empty list for an empty specs map', () => {
    expect(publicSpecRows({})).toEqual([]);
  });

  it('hides the integrated GPU on the graphics card row', () => {
    const rows = publicSpecRows({ graphicsCard: 'AMD Radeon(TM) Graphics + NVIDIA GeForce RTX 5080' });
    expect(rows[0].value).toBe('NVIDIA GeForce RTX 5080');
  });
});

describe('withoutIntegratedGpus', () => {
  it.each([
    ['AMD Radeon(TM) Graphics + NVIDIA GeForce RTX 5080', 'NVIDIA GeForce RTX 5080'],
    ['Intel(R) UHD Graphics 770 + AMD Radeon RX 7900 XTX', 'AMD Radeon RX 7900 XTX'],
    ['Intel(R) Arc(TM) Graphics + NVIDIA GeForce RTX 4070 Laptop GPU', 'NVIDIA GeForce RTX 4070 Laptop GPU'],
    ['AMD Radeon 780M Graphics + Intel(R) Arc(TM) B580 Graphics', 'Intel(R) Arc(TM) B580 Graphics'],
    ['NVIDIA GeForce RTX 5090 + NVIDIA GeForce RTX 3070', 'NVIDIA GeForce RTX 5090 + NVIDIA GeForce RTX 3070'],
    ['Gigabyte GeForce RTX 3070', 'Gigabyte GeForce RTX 3070'],
  ])('%s -> %s', (input, expected) => {
    expect(withoutIntegratedGpus(input)).toBe(expected);
  });

  it('keeps the iGPU when it is the only adapter', () => {
    expect(withoutIntegratedGpus('Intel(R) Iris(R) Xe Graphics')).toBe('Intel(R) Iris(R) Xe Graphics');
  });
});
