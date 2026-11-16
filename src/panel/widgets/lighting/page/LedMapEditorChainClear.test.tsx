// @vitest-environment jsdom
/**
 * Removing the last mapped device from an ARGB header. The staged chain is
 * empty, the preview is asked for it, and Save posts it so the service
 * returns the port to one plain zone.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { LightingDevice } from '../../../../api/lighting';

const api = vi.hoisted(() => ({
  fetchDeviceStructure: vi.fn(),
  fetchDeviceMap: vi.fn(),
  saveDeviceMap: vi.fn(),
  saveDeviceZones: vi.fn(),
  resetDeviceMap: vi.fn(),
  resetDeviceZones: vi.fn(),
  setDeviceChain: vi.fn(),
  previewDeviceChain: vi.fn(),
  highlightLeds: vi.fn(),
  testLedPattern: vi.fn(),
  clearLedEditor: vi.fn(),
  postLedPreviewLayout: vi.fn(),
  setLightingDeviceColor: vi.fn(),
  setHubComposition: vi.fn(),
  identifyLightingDevice: vi.fn(),
  fetchMappingCatalog: vi.fn(),
  assignBuiltInMapping: vi.fn(),
}));

vi.mock('../../../../api/lighting', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../../api/lighting')>();
  return { ...actual, ...api };
});

vi.mock('../../../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (k: string, v?: Record<string, unknown>) => (v ? `${k}:${JSON.stringify(v)}` : k),
    language: 'en',
  }),
}));

const toast = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('../../../../components/common/Toast/Toast', () => ({ useToast: () => toast }));

const portId = 'port-1';
const mappedZone = { id: `${portId}:z0`, name: 'SL120', slices: [{ segment: 0, start: 0, count: 16 }] };
const plainZone = { id: portId, name: 'ARGB_V2_1', slices: [{ segment: 0, start: 0, count: 16 }] };

const structureFor = (zs: unknown[], chain: unknown[]) => ({
  id: portId, name: 'ARGB_V2_1', deviceKey: 'k', isDefaultPartition: chain.length === 0,
  segments: [{ index: 0, name: 'ARGB_V2_1', ledCount: 16, resizable: true, zoneType: 'linear' }],
  zones: zs,
  chainable: true,
  chain,
});
const emptyMap = { id: portId, aspectRatio: 0, segments: [] };

const card = (z: { id: string; name: string }): LightingDevice => ({
  id: z.id, name: z.name, type: 'ledstrip', iconType: 'strip', ledsOn: true, controlled: true,
  brightness: 100, hue: 0, saturation: 1, ledCount: 16, enabledLedCount: 16,
  canvasX: 0, canvasY: 0, canvasW: 80, canvasH: 60, canvasRotation: 0,
  deviceId: portId, parentDeviceId: 'board', zoneIndex: 0, zoneCustomizable: true,
  deviceKey: '', conflictAppIds: [],
} as unknown as LightingDevice);

let LedMapEditor: typeof import('./LedMapEditor').LedMapEditor;

beforeEach(async () => {
  for (const fn of Object.values(api)) fn.mockReset();
  api.fetchDeviceStructure.mockResolvedValue(structureFor([mappedZone], [
    { key: 'product:lianli-sl120', name: 'SL120', ledCount: 16, editableCount: false },
  ]));
  api.fetchDeviceMap.mockResolvedValue(emptyMap);
  api.fetchMappingCatalog.mockResolvedValue({ items: [], total: 0 });
  api.postLedPreviewLayout.mockResolvedValue(undefined);
  api.previewDeviceChain.mockResolvedValue({
    error: false, structure: structureFor([plainZone], []), map: emptyMap,
  });
  api.setDeviceChain.mockResolvedValue({ error: false, msg: '' });
  ({ LedMapEditor } = await import('./LedMapEditor'));
});

afterEach(() => { vi.restoreAllMocks(); });

describe('LedMapEditor removing the last chain device', () => {
  it('previews and saves an empty chain, leaving an unmapped single zone', async () => {
    render(
      <LedMapEditor
        deviceId={portId}
        initialZoneId={mappedZone.id}
        devices={[card(mappedZone)]}
        zoneCustomizable
        onClose={vi.fn()}
      />,
    );
    await screen.findByText('SL120');
    fireEvent.click(await screen.findByRole('button', { name: 'lighting.ledMap.chainRemove' }));

    await waitFor(() => expect(api.previewDeviceChain).toHaveBeenCalledWith(portId, []));
    // The port is one plain zone now: nothing left to remove.
    await waitFor(() => expect(screen.queryByRole('button', { name: 'lighting.ledMap.chainRemove' })).toBeNull());
    expect(api.setDeviceChain).not.toHaveBeenCalled();

    fireEvent.click(await screen.findByRole('button', { name: 'lighting.ledMap.save' }));
    await waitFor(() => expect(api.setDeviceChain).toHaveBeenCalledWith(portId, []));
  });
});
