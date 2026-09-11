import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { LedMapEditor } from './LedMapEditor';
import type { LightingDevice } from '../../../../api/lighting';

vi.mock('../../../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
    language: 'en',
  }),
}));

const toast = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('../../../../components/common/Toast/Toast', () => ({
  useToast: () => toast,
}));

const api = vi.hoisted(() => ({
  fetchDeviceStructure: vi.fn(),
  fetchDeviceMap: vi.fn(),
  setDeviceChain: vi.fn(),
  previewDeviceChain: vi.fn(),
  fetchMappingCatalog: vi.fn(),
}));
vi.mock('../../../../api/lighting', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../../api/lighting')>();
  return {
    ...actual,
    fetchDeviceStructure: api.fetchDeviceStructure,
    fetchDeviceMap: api.fetchDeviceMap,
    setDeviceChain: api.setDeviceChain,
    previewDeviceChain: api.previewDeviceChain,
    fetchMappingCatalog: api.fetchMappingCatalog,
    highlightLeds: vi.fn(),
    testLedPattern: vi.fn(),
    clearLedEditor: vi.fn(),
    postLedPreviewLayout: vi.fn().mockResolvedValue(null),
    setLightingDeviceBrightness: vi.fn(),
    fetchGlobalBrightness: vi.fn().mockResolvedValue(null),
  };
});

// A Q60-shaped card: fixed LED count, no zone management, no resize.
const q60: LightingDevice = {
  id: 'qseries:QTEST123',
  name: 'HYTE Q60',
  ledsOn: true,
  ledCount: 46,
  canvasX: 0, canvasY: 0, canvasW: 1, canvasH: 1, canvasRotation: 0,
  zoneResizable: false,
};

function renderEditor() {
  return render(
    <LedMapEditor
      deviceId={q60.id}
      initialZoneId={q60.id}
      devices={[q60]}
      zoneCustomizable={false}
      onClose={() => {}}
    />,
  );
}

// The service answers an unknown device with `error: true` at HTTP 200, so the
// body is a well-formed empty shell rather than a transport failure.
const errorShell = { error: true, msg: 'unknown device' };

beforeEach(() => {
  toast.push.mockClear();
  api.fetchDeviceStructure.mockReset();
  api.fetchDeviceMap.mockReset();
  api.setDeviceChain.mockReset();
  api.previewDeviceChain.mockReset();
  api.fetchMappingCatalog.mockReset();
  api.fetchMappingCatalog.mockResolvedValue({ error: false, msg: '', items: [], total: 0 });
});

describe('LedMapEditor load()', () => {
  it('reports an error:true body as a failed load', async () => {
    api.fetchDeviceStructure.mockResolvedValue({ ...errorShell, segments: [], zones: [] });
    api.fetchDeviceMap.mockResolvedValue({ ...errorShell, segments: [], aspectRatio: 0 });

    renderEditor();

    await waitFor(() => expect(toast.push).toHaveBeenCalled());
    expect(toast.push.mock.calls[0][0].title).toContain('loadFailed');
  });

  it('falls back to the card LED count instead of reporting zero', async () => {
    api.fetchDeviceStructure.mockResolvedValue({ ...errorShell, segments: [], zones: [] });
    api.fetchDeviceMap.mockResolvedValue({ ...errorShell, segments: [], aspectRatio: 0 });

    renderEditor();

    await waitFor(() => expect(toast.push).toHaveBeenCalled());
    await waitFor(() => {
      const readout = document.querySelector('[class*="zoneCount"]');
      expect(readout?.textContent).toBe('46');
    });
  });

  it('shows the zone count when the structure loads', async () => {
    api.fetchDeviceStructure.mockResolvedValue({
      id: q60.id, name: 'HYTE Q60', deviceKey: 'k', isDefaultPartition: true,
      segments: [{ index: 0, name: 'Panel + Logo', ledCount: 46, resizable: false, zoneType: 'matrix' }],
      zones: [{ id: q60.id, name: 'Panel + Logo', slices: [{ segment: 0, start: 0, count: 46 }] }],
    });
    api.fetchDeviceMap.mockResolvedValue({
      id: q60.id, aspectRatio: 0,
      segments: [{
        index: 0, name: 'Panel + Logo', ledCount: 46, resizable: false, zoneType: 'matrix',
        leds: Array.from({ length: 46 }, (_, i) => ({
          index: i, u: i / 46, v: 0.5, disabled: false, zoneId: q60.id, isCustom: false, name: `LED ${i}`,
        })),
      }],
    });

    renderEditor();

    await waitFor(() => {
      const readout = document.querySelector('[class*="zoneCount"]');
      expect(readout?.textContent).toBe('46');
    });
    expect(toast.push).not.toHaveBeenCalled();
  });
});

describe('LedMapEditor header on a renamed device', () => {
  const structure = {
    id: q60.id, name: 'HYTE Q60', deviceKey: 'k', isDefaultPartition: true,
    segments: [{ index: 0, name: 'Panel + Logo', ledCount: 46, resizable: false, zoneType: 'matrix' }],
    zones: [{ id: q60.id, name: 'Panel + Logo', slices: [{ segment: 0, start: 0, count: 46 }] }],
  };

  const renderRenamed = (device: LightingDevice) => {
    api.fetchDeviceStructure.mockResolvedValue(structure);
    api.fetchDeviceMap.mockResolvedValue({ id: q60.id, aspectRatio: 0, segments: [] });
    return render(
      <LedMapEditor
        deviceId={device.id}
        initialZoneId={device.id}
        devices={[device]}
        zoneCustomizable={false}
        onClose={() => {}}
      />,
    );
  };

  it('titles the modal with the custom name, not the name the zones API reports', async () => {
    renderRenamed({ ...q60, name: 'Top intake', originalName: 'HYTE Q60' });
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Top intake' })).toBeTruthy());
  });

  it('keeps the hardware name visible under it', async () => {
    renderRenamed({ ...q60, name: 'Top intake', originalName: 'HYTE Q60' });
    await waitFor(() => expect(screen.getByText('HYTE Q60')).toBeTruthy());
  });

  it('titles with the device name alone, without the LED map suffix', async () => {
    renderRenamed(q60);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'HYTE Q60' })).toBeTruthy());
  });

  it('shows no second name when the device was never renamed', async () => {
    renderRenamed(q60);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'HYTE Q60' })).toBeTruthy());
    expect(screen.queryAllByText('HYTE Q60')).toHaveLength(1);
  });
});

// A keeb-shaped device: two zones whose ids ARE the device-rail card ids, so a
// card renamed on the rail has to name its row here too.
describe('LedMapEditor zone rows on a renamed zone card', () => {
  const parent = 'keeb:tkl-1';
  const keys = { ...q60, id: `${parent}:keys`, name: 'HYTE Keeb TKL - Keys', parentDeviceId: parent, zoneIndex: 0, deviceId: parent };
  const under = { ...q60, id: `${parent}:underglow`, name: 'HYTE Keeb TKL - Underglow', parentDeviceId: parent, zoneIndex: 1, deviceId: parent };

  const renderKeeb = (cards: LightingDevice[]) => {
    api.fetchDeviceStructure.mockResolvedValue({
      id: parent, name: 'HYTE Keeb TKL', deviceKey: 'k', isDefaultPartition: true,
      segments: [
        { index: 0, name: 'Keys', ledCount: 96, resizable: false, zoneType: 'matrix' },
        { index: 1, name: 'Underglow', ledCount: 51, resizable: false, zoneType: 'linear' },
      ],
      zones: [
        { id: keys.id, name: 'Keys', slices: [{ segment: 0, start: 0, count: 96 }] },
        { id: under.id, name: 'Underglow', slices: [{ segment: 1, start: 0, count: 51 }] },
      ],
    });
    api.fetchDeviceMap.mockResolvedValue({ id: parent, aspectRatio: 0, segments: [] });
    return render(
      <LedMapEditor
        deviceId={parent}
        initialZoneId={under.id}
        devices={cards}
        zoneCustomizable
        onClose={() => {}}
      />,
    );
  };

  it('names the row with the card rename, not the zones API name', async () => {
    renderKeeb([keys, { ...under, name: 'Desk glow', originalName: 'HYTE Keeb TKL - Underglow' }]);
    await waitFor(() => expect(screen.getByText('Desk glow')).toBeTruthy());
    expect(screen.queryByText('Underglow')).toBeNull();
  });

  it('leaves an unrenamed zone on its zones API name', async () => {
    renderKeeb([keys, under]);
    await waitFor(() => expect(screen.getByText('Underglow')).toBeTruthy());
  });

  it('adds no second name line for a zone rename', async () => {
    renderKeeb([keys, { ...under, name: 'Desk glow', originalName: 'HYTE Keeb TKL - Underglow' }]);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'HYTE Keeb TKL' })).toBeTruthy());
    expect(screen.queryByText('HYTE Keeb TKL - Underglow')).toBeNull();
  });
});

// The T1 board's chained port: the zone list is what is wired to it.
describe('LedMapEditor on a chainable port', () => {
  const portId = 'openrgb-C000-1';
  const zones = [
    { id: `${portId}:z0`, name: 'B850I - ARGB_V2_2 - QX Fan 1', slices: [{ segment: 0, start: 0, count: 34 }] },
    { id: `${portId}:z1`, name: 'B850I - ARGB_V2_2 - Generic Strip', slices: [{ segment: 0, start: 34, count: 20 }] },
  ];
  const cards: LightingDevice[] = zones.map((z, i) => ({
    ...q60, id: z.id, name: z.name, ledCount: i === 0 ? 34 : 20, parentDeviceId: 'openrgb-C000', zoneIndex: i, deviceId: portId,
  }));

  const portStructure = () => ({
    id: portId, name: 'ARGB_V2_2', deviceKey: 'k', isDefaultPartition: false,
    segments: [{ index: 0, name: 'ARGB_V2_2', ledCount: 54, resizable: true, zoneType: 'linear' }],
    zones,
    chainable: true,
    chain: [
      { key: 'product:corsair-qx-fan', name: 'Corsair QX Fan', ledCount: 34, editableCount: false },
      { key: 'generic:strip', name: 'Generic Strip', ledCount: 20, editableCount: true },
    ],
  });
  const portMap = () => ({ id: portId, aspectRatio: 0, segments: [] });

  const renderPort = () => {
    api.fetchDeviceStructure.mockResolvedValue(portStructure());
    api.fetchDeviceMap.mockResolvedValue(portMap());
    api.setDeviceChain.mockResolvedValue({ error: false, msg: '', ledCount: 54, zoneIds: zones.map(z => z.id) });
    // A chain edit previews; only Save posts it.
    api.previewDeviceChain.mockResolvedValue({ error: false, msg: '', structure: portStructure(), map: portMap() });
    return render(
      <LedMapEditor
        deviceId={portId}
        initialZoneId={zones[0].id}
        devices={cards}
        zoneCustomizable
        onClose={() => {}}
      />,
    );
  };

  it('names the rows by their products, types the generic\'s count, and shows the total', async () => {
    renderPort();
    await waitFor(() => expect(screen.getByText('Corsair QX Fan')).toBeTruthy());
    expect(screen.getByText('Generic Strip')).toBeTruthy();
    expect(screen.queryByText('B850I - ARGB_V2_2 - QX Fan 1')).toBeNull();
    const input = document.querySelector<HTMLInputElement>('[class*="zoneCountInput"]');
    expect(input?.value).toBe('20');
    expect(document.querySelector('[class*="totalCount"]')?.textContent).toBe('54');
    expect(screen.getByRole('button', { name: 'lighting.ledMap.chainAdd' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'lighting.ledMap.zoneMerge' })).toBeNull();
  });

  it('previews a retyped generic count without committing it', async () => {
    renderPort();
    const input = await waitFor(() => {
      const el = document.querySelector<HTMLInputElement>('[class*="zoneCountInput"]');
      expect(el).not.toBeNull();
      return el!;
    });
    fireEvent.change(input, { target: { value: '24' } });
    fireEvent.blur(input);
    await waitFor(() => expect(api.previewDeviceChain).toHaveBeenCalledWith(portId, [
      { key: 'product:corsair-qx-fan' },
      { key: 'generic:strip', ledCount: 24 },
    ]));
    // Nothing is on disk until Save, so an abandoned edit leaves no trace.
    expect(api.setDeviceChain).not.toHaveBeenCalled();
  });

  it('previews a removed zone without committing it', async () => {
    renderPort();
    const remove = await screen.findAllByRole('button', { name: 'lighting.ledMap.chainRemove' });
    fireEvent.click(remove[0]);
    await waitFor(() => expect(api.previewDeviceChain).toHaveBeenCalledWith(portId, [{ key: 'generic:strip', ledCount: 20 }]));
    expect(api.setDeviceChain).not.toHaveBeenCalled();
  });

  it('posts the staged chain when the editor is saved', async () => {
    renderPort();
    const remove = await screen.findAllByRole('button', { name: 'lighting.ledMap.chainRemove' });
    fireEvent.click(remove[0]);
    await waitFor(() => expect(api.previewDeviceChain).toHaveBeenCalled());
    fireEvent.click(await screen.findByRole('button', { name: 'lighting.ledMap.save' }));
    await waitFor(() => expect(api.setDeviceChain).toHaveBeenCalledWith(portId, [{ key: 'generic:strip', ledCount: 20 }]));
  });

  it('reports a rejected chain instead of showing it', async () => {
    renderPort();
    api.previewDeviceChain.mockResolvedValue({ error: true, msg: 'unknown mapping' });
    const remove = await screen.findAllByRole('button', { name: 'lighting.ledMap.chainRemove' });
    fireEvent.click(remove[0]);
    await waitFor(() => expect(toast.push).toHaveBeenCalled());
    expect(toast.push.mock.calls[0][0].title).toContain('assignFailed');
    expect(api.setDeviceChain).not.toHaveBeenCalled();
  });
});
