import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SupportedDevicesList, type SupportedDeviceRow } from './SupportedDevicesList';

const DEVICES: SupportedDeviceRow[] = [
  { vendor: 'Razer', model: 'BlackWidow V4 Pro', category: 'keyboard', vendorId: '0x1532', productId: '0x0290', capabilities: ['RGB', 'Macro'], source: 'nexus' },
  { vendor: 'Corsair', model: 'iCUE LINK Hub', category: 'lighting', vendorId: '0x1B1C', productId: '0x0C3F', capabilities: ['RGB'], source: 'openrgb' },
  { vendor: 'Logitech', model: 'G Pro X Superlight 2', category: 'mouse', vendorId: '0x046D', productId: '0xC094', capabilities: ['RGB', 'Battery'], source: 'nexus' },
];

describe('SupportedDevicesList', () => {
  it('renders one row per device with brand, model, type, and VID:PID', () => {
    render(<SupportedDevicesList devices={DEVICES} />);

    expect(screen.getByText('Razer')).toBeInTheDocument();
    expect(screen.getByText('BlackWidow V4 Pro')).toBeInTheDocument();
    expect(screen.getByText('keyboard')).toBeInTheDocument();
    expect(screen.getByText('0x1532:0290')).toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(DEVICES.length + 1); // + header row
  });

  it('marks a row detected only when its VID:PID is in detectedVidPids', () => {
    render(<SupportedDevicesList devices={DEVICES} detectedVidPids={new Set(['0x1532:0x0290'])} />);

    const rows = screen.getAllByRole('row').slice(1); // drop header
    expect(rows[0].className).toMatch(/detected/);
    expect(rows[1].className).not.toMatch(/detected/);
    expect(rows[2].className).not.toMatch(/detected/);
  });

  it('renders with react-dom/server without throwing, producing every row', () => {
    const html = renderToString(<SupportedDevicesList devices={DEVICES} />);

    expect(html).toContain('Razer');
    expect(html).toContain('BlackWidow V4 Pro');
    expect(html).toContain('Corsair');
    expect(html).toContain('iCUE LINK Hub');
    expect(html).toContain('Logitech');
    expect(html).toContain('G Pro X Superlight 2');
    expect((html.match(/<tr/g) ?? []).length).toBe(DEVICES.length + 1); // + header row
  });

  it('renders an empty table (header only) with no devices', () => {
    const html = renderToString(<SupportedDevicesList devices={[]} />);
    expect((html.match(/<tr/g) ?? []).length).toBe(1);
  });
});
