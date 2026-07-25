import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SupportedDevicesList, type SupportedDeviceRow } from './SupportedDevicesList';

const DEVICES: SupportedDeviceRow[] = [
  { vendor: 'HYTE', model: 'Keeb TKL', category: 'keyboard', vendorId: '0x3402', productId: '0x0300', capabilities: ['rgb'], source: 'nexus' },
  { vendor: 'Corsair', model: 'iCUE LINK Hub', category: 'lighting', vendorId: '0x1B1C', productId: '0x0C3F', capabilities: ['RGB'], source: 'openrgb' },
  { vendor: 'Elgato', model: 'Stream Deck MK.2', category: 'controller', vendorId: '0x0FD9', productId: '0x0080', capabilities: ['keys', 'brightness', 'screen'], source: 'nexus' },
];

describe('SupportedDevicesList', () => {
  it('renders one row per device with brand, model, type, and VID:PID', () => {
    render(<SupportedDevicesList devices={DEVICES} />);

    expect(screen.getByText('HYTE')).toBeInTheDocument();
    expect(screen.getByText('Keeb TKL')).toBeInTheDocument();
    expect(screen.getByText('keyboard')).toBeInTheDocument();
    expect(screen.getByText('0x3402:0300')).toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(DEVICES.length + 1); // + header row
  });

  it('marks a row detected only when its VID:PID is in detectedVidPids', () => {
    render(<SupportedDevicesList devices={DEVICES} detectedVidPids={new Set(['0x3402:0x0300'])} />);

    const rows = screen.getAllByRole('row').slice(1); // drop header
    expect(rows[0].className).toMatch(/detected/);
    expect(rows[1].className).not.toMatch(/detected/);
    expect(rows[2].className).not.toMatch(/detected/);
  });

  it('renders with react-dom/server without throwing, producing every row', () => {
    const html = renderToString(<SupportedDevicesList devices={DEVICES} />);

    expect(html).toContain('HYTE');
    expect(html).toContain('Keeb TKL');
    expect(html).toContain('Corsair');
    expect(html).toContain('iCUE LINK Hub');
    expect(html).toContain('Elgato');
    expect(html).toContain('Stream Deck MK.2');
    expect((html.match(/<tr/g) ?? []).length).toBe(DEVICES.length + 1); // + header row
  });

  it('renders an empty table (header only) with no devices', () => {
    const html = renderToString(<SupportedDevicesList devices={[]} />);
    expect((html.match(/<tr/g) ?? []).length).toBe(1);
  });
});
