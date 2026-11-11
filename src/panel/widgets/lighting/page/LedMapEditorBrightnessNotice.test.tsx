// The brightness notice under the canvas: shown only while the level scaling
// this device's bytes is below full.
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LedMapEditor } from './LedMapEditor';
import type { LightingDevice } from '../../../../api/lighting';

vi.mock('../../../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
    language: 'en',
  }),
}));
vi.mock('../../../../components/common/Toast/Toast', () => ({
  useToast: () => ({ push: vi.fn() }),
}));

const { ZONE_A, ZONE_B } = vi.hoisted(() => ({ ZONE_A: 'openrgb:dev:z0', ZONE_B: 'openrgb:dev:z1' }));

const api = vi.hoisted(() => ({
  fetchLedColors: vi.fn(),
  setLedColors: vi.fn(),
  clearLedColors: vi.fn(),
  fetchGlobalBrightness: vi.fn(),
  fetchBrightnessSchedule: vi.fn(),
}));
vi.mock('../../../../api/lighting', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../../api/lighting')>();
  return {
    ...actual,
    fetchDeviceStructure: vi.fn().mockResolvedValue({
      id: ZONE_B, name: 'Strip', deviceKey: 'k', isDefaultPartition: true,
      segments: [{ index: 0, name: 'Strip', ledCount: 10, resizable: false, zoneType: 'linear' }],
      zones: [
        { id: ZONE_A, name: 'A', slices: [{ segment: 0, start: 0, count: 5 }] },
        { id: ZONE_B, name: 'B', slices: [{ segment: 0, start: 5, count: 5 }] },
      ],
    }),
    fetchDeviceMap: vi.fn().mockResolvedValue({
      id: ZONE_B, aspectRatio: 0,
      segments: [{
        index: 0, name: 'Strip', ledCount: 10, resizable: false, zoneType: 'linear',
        leds: Array.from({ length: 10 }, (_, i) => ({
          index: i, u: (i + 0.5) / 10, v: 0.5, disabled: false, zoneId: i < 5 ? ZONE_A : ZONE_B, isCustom: false, name: `LED ${i}`,
        })),
      }],
    }),
    fetchMappingCatalog: vi.fn().mockResolvedValue({ error: false, msg: '', items: [], total: 0 }),
    fetchLedColors: api.fetchLedColors,
    setLedColors: api.setLedColors,
    clearLedColors: api.clearLedColors,
    highlightLeds: vi.fn(),
    testLedPattern: vi.fn(),
    clearLedEditor: vi.fn(),
    postLedPreviewLayout: vi.fn().mockResolvedValue(null),
    setLightingDeviceBrightness: vi.fn(),
    fetchGlobalBrightness: api.fetchGlobalBrightness,
    fetchBrightnessSchedule: api.fetchBrightnessSchedule,
  };
});

const card = (id: string, brightness?: number): LightingDevice => ({
  id, name: id, ledsOn: true, ledCount: 5, brightness,
  canvasX: 0, canvasY: 0, canvasW: 1, canvasH: 1, canvasRotation: 0, zoneResizable: false,
});

function mount(brightness?: number) {
  api.fetchLedColors.mockResolvedValue({ leds: [] });
  render(
    <LedMapEditor
      deviceId={ZONE_B}
      initialZoneId={ZONE_B}
      devices={[card(ZONE_A), card(ZONE_B, brightness)]}
      zoneCustomizable={false}
      onClose={() => {}}
    />,
  );
}

const schedule = (enabled: boolean, lightingFollows = true) => ({
  enabled, points: [{ hour: 0, brightness: 45 }], defaults: [], sunShift: false, location: null,
  sun: null, lightingFollows,
});

describe('LedMapEditor brightness notice', () => {
  it('shows the scheduled level that scales the output', async () => {
    api.fetchGlobalBrightness.mockResolvedValue({ value: 1 });
    api.fetchBrightnessSchedule.mockResolvedValue(schedule(true));
    mount(100);
    const notice = await screen.findByRole('status');
    expect(notice.textContent).toContain('lighting.ledMap.brightnessDimmed');
    fireEvent.pointerEnter(notice);
    const tip = await screen.findByRole('tooltip');
    expect(tip.textContent).toContain('lighting.ledMap.brightnessSchedule');
    expect(tip.textContent).toContain('"level":45');
  });

  it('shows the master level when it is below full', async () => {
    api.fetchGlobalBrightness.mockResolvedValue({ value: 0.6 });
    api.fetchBrightnessSchedule.mockResolvedValue(schedule(false));
    mount(100);
    const notice = await screen.findByRole('status');
    fireEvent.pointerEnter(notice);
    const tip = await screen.findByRole('tooltip');
    expect(tip.textContent).toContain('"level":60');
    expect(tip.textContent).toContain('lighting.settings.brightnessLabel');
    expect(tip.querySelectorAll('li')).toHaveLength(1);
  });

  it('is hidden at full brightness', async () => {
    api.fetchGlobalBrightness.mockResolvedValue({ value: 1 });
    api.fetchBrightnessSchedule.mockResolvedValue(schedule(false));
    mount(100);
    await waitFor(() => expect(document.querySelectorAll('[data-led="1"]')).toHaveLength(10));
    await waitFor(() => expect(api.fetchBrightnessSchedule).toHaveBeenCalled());
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('ignores a schedule lighting does not follow', async () => {
    api.fetchGlobalBrightness.mockResolvedValue({ value: 1 });
    api.fetchBrightnessSchedule.mockResolvedValue(schedule(true, false));
    mount(100);
    await waitFor(() => expect(api.fetchBrightnessSchedule).toHaveBeenCalled());
    await waitFor(() => expect(document.querySelectorAll('[data-led="1"]')).toHaveLength(10));
    expect(screen.queryByRole('status')).toBeNull();
  });
});
