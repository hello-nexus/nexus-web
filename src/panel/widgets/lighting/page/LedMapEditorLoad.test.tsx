import { render, screen, waitFor } from '@testing-library/react';
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
}));
vi.mock('../../../../api/lighting', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../../api/lighting')>();
  return {
    ...actual,
    fetchDeviceStructure: api.fetchDeviceStructure,
    fetchDeviceMap: api.fetchDeviceMap,
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
      const readout = document.querySelector('[class*="ledCountReadonly"]');
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
      const readout = document.querySelector('[class*="ledCountReadonly"]');
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
    await waitFor(() => expect(screen.getByText('Top intake - lighting.ledMap.title')).toBeTruthy());
  });

  it('keeps the hardware name visible beside it', async () => {
    renderRenamed({ ...q60, name: 'Top intake', originalName: 'HYTE Q60' });
    await waitFor(() => expect(screen.getByText('HYTE Q60')).toBeTruthy());
  });

  it('shows no second name when the device was never renamed', async () => {
    renderRenamed(q60);
    await waitFor(() => expect(screen.getByText('HYTE Q60 - lighting.ledMap.title')).toBeTruthy());
    expect(screen.queryByText('HYTE Q60')).toBeNull();
  });
});
