import { render, waitFor } from '@testing-library/react';
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

// A Nollie channel card: user-declared LED count, resizable, one linear zone.
function channelCard(ledCount: number): LightingDevice {
  return {
    id: 'nollie-s-ABC:ch0',
    name: 'Nollie 1_OS2_1 - Channel 1',
    ledsOn: true,
    ledCount,
    canvasX: 0, canvasY: 0, canvasW: 1, canvasH: 1, canvasRotation: 0,
    zoneResizable: true,
    parentDeviceId: 'nollie-s-ABC',
    zoneIndex: 0,
  };
}

function mockZone(ledCount: number) {
  const id = 'nollie-s-ABC:ch0';
  // One addressable port carrying a generic strip: the count is the user's to type.
  api.fetchDeviceStructure.mockResolvedValue({
    id, name: 'Channel 1', deviceKey: 'k', isDefaultPartition: true,
    chainable: true,
    chain: [{ key: 'generic:strip', name: 'Generic Strip', ledCount, editableCount: true }],
    segments: [{ index: 0, name: 'Channel 1', ledCount, resizable: true, zoneType: 'linear' }],
    zones: [{ id, name: 'Channel 1', slices: [{ segment: 0, start: 0, count: ledCount }] }],
  });
  api.fetchDeviceMap.mockResolvedValue({
    id, aspectRatio: 0,
    segments: [{
      index: 0, name: 'Channel 1', ledCount, resizable: true, zoneType: 'linear',
      leds: Array.from({ length: ledCount }, (_, i) => ({
        index: i, u: i / ledCount, v: 0.5, disabled: false, zoneId: id, isCustom: false, name: `LED ${i}`,
      })),
    }],
  });
}

function renderEditor(ledCount: number) {
  const card = channelCard(ledCount);
  return render(
    <LedMapEditor
      deviceId={card.id}
      initialZoneId={card.id}
      devices={[card]}
      zoneCustomizable={false}
      onClose={() => {}}
    />,
  );
}

beforeEach(() => {
  toast.push.mockClear();
  api.fetchDeviceStructure.mockReset();
  api.fetchDeviceMap.mockReset();
});

/**
 * Above the mappable ceiling the canvas declines rather than drawing a swarm of
 * unreadable dots. The LED count stays editable - only the visual map opts out.
 */
describe('LedMapEditor large zones', () => {
  it('still maps at the ceiling', async () => {
    mockZone(300);
    renderEditor(300);

    await waitFor(() => {
      expect(document.querySelectorAll('[data-led="1"]').length).toBeGreaterThan(0);
    });
    expect(document.querySelector('[class*="mappingUnavailable"]')).toBeNull();
  });

  it('draws no LEDs and says so above the ceiling', async () => {
    mockZone(301);
    renderEditor(301);

    await waitFor(() => {
      expect(document.querySelector('[class*="mappingUnavailable"]')).not.toBeNull();
    });
    expect(document.querySelectorAll('[data-led="1"]').length).toBe(0);
  });

  it('keeps the LED count editable above the ceiling', async () => {
    mockZone(630);
    renderEditor(630);

    await waitFor(() => {
      expect(document.querySelector('[class*="mappingUnavailable"]')).not.toBeNull();
    });
    const input = document.querySelector<HTMLInputElement>('[class*="zoneCountInput"]');
    expect(input).not.toBeNull();
    expect(input?.value).toBe('630');
  });
});
