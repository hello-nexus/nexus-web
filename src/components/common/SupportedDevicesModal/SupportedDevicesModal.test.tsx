import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { SupportedDevice } from '../../../hooks/useSupportedDevices';
import { SupportedDevicesModal } from './SupportedDevicesModal';

const DEVICES: SupportedDevice[] = [
  { vendor: 'Corsair', model: 'Hydro H100i Elite', category: 'cooler', vendorId: '0x1B1C', productId: '0x0C35', capabilities: ['RGB'], source: 'openrgb' },
  { vendor: 'Corsair', model: 'K70 RGB', category: 'keyboard', vendorId: '0x1B1C', productId: '0x1B13', capabilities: ['RGB'], source: 'openrgb' },
  { vendor: 'HYTE', model: 'THICC Q60', category: 'cooler', vendorId: '0x3402', productId: '0x0400', capabilities: ['screen'], source: 'nexus' },
];

vi.mock('../../../hooks/useSupportedDevices', () => ({
  useSupportedDevices: () => ({ devices: DEVICES, loading: false }),
}));

function search(query: string): string[] {
  fireEvent.change(screen.getByRole('textbox'), { target: { value: query } });
  return screen.queryAllByRole('row').slice(1).map(r => r.cells[2].textContent ?? '');
}

describe('SupportedDevicesModal search', () => {
  it('matches every word against vendor or model in any order', () => {
    render(<SupportedDevicesModal open onClose={() => {}} />);

    expect(search('corsair hy')).toEqual(['Hydro H100i Elite']);
    expect(search('hy corsair')).toEqual(['Hydro H100i Elite']);
    expect(search('  corsair   ')).toEqual(['Hydro H100i Elite', 'K70 RGB']);
    expect(search('corsair q60')).toEqual([]);
    expect(search('')).toHaveLength(DEVICES.length);
  });

  it('does not match a word spanning vendor and model', () => {
    render(<SupportedDevicesModal open onClose={() => {}} />);

    expect(search('corsairhydro')).toEqual([]);
  });
});
