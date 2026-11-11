// Live dot colors: the frame section is per zone card in zone-local order, the
// editor's dots are in device order. A second zone is where the two diverge.
import { render, waitFor } from '@testing-library/react';
import { act } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearLedFrame, publishLedFrame } from '../../../../lib/ledFrameStore';
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
    fetchGlobalBrightness: vi.fn().mockResolvedValue(null),
  };
});

const card = (id: string, frameIndex?: number): LightingDevice => ({
  id, name: id, ledsOn: true, ledCount: 5, frameIndex,
  canvasX: 0, canvasY: 0, canvasW: 1, canvasH: 1, canvasRotation: 0, zoneResizable: false,
});

afterEach(() => clearLedFrame());

describe('LedMapEditor live dots', () => {
  it('paints each dot with the color sent to its zone-local LED and leaves unsent zones grey', async () => {
    api.fetchLedColors.mockResolvedValue({ leds: [] });
    // Frame byte 7 carries zone B only: its first LED red, its second green.
    publishLedFrame(null, 0, 0, new Map([[7, new Uint8Array([255, 0, 0, 0, 255, 0])]]));
    render(
      <LedMapEditor
        deviceId={ZONE_B}
        initialZoneId={ZONE_B}
        devices={[card(ZONE_A), card(ZONE_B, 7)]}
        zoneCustomizable={false}
        onClose={() => {}}
      />,
    );
    await waitFor(() => expect(document.querySelectorAll('[data-led="1"]')).toHaveLength(10));
    await waitFor(() => expect((document.querySelectorAll('[data-led="1"]')[5] as HTMLElement).style.background).toBe('rgb(255, 0, 0)'));
    const dots = Array.from(document.querySelectorAll<HTMLElement>('[data-led="1"]'));
    expect(dots[6].style.background).toBe('rgb(0, 255, 0)');
    // Past the 2 LEDs the section holds, and the whole of zone A: nothing sent.
    expect(dots[7].style.background).toBe('');
    expect(dots[0].style.background).toBe('');

    act(() => { publishLedFrame(null, 0, 0, new Map()); });
    await waitFor(() => expect(dots[5].style.background).toBe(''));
  });
});
