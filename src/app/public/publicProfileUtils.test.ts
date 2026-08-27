// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { publicSpecRows } from './publicProfileUtils';

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
});
