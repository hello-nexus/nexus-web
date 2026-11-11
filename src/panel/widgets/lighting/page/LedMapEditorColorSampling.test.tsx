// The color sampling dropdown sits immediately left of the sampling dropdown.
import { render, screen } from '@testing-library/react';
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
  fetchLedColors: vi.fn().mockResolvedValue({ leds: [] }),
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

const card = (id: string, over: Partial<LightingDevice> = {}): LightingDevice => ({
  id, name: id, ledsOn: true, ledCount: 5,
  canvasX: 0, canvasY: 0, canvasW: 1, canvasH: 1, canvasRotation: 0, zoneResizable: false, ...over,
});

describe('LedMapEditor color sampling control', () => {
  it('renders left of the sampling dropdown and shows the card value', async () => {
    render(
      <LedMapEditor
        deviceId={ZONE_B}
        initialZoneId={ZONE_B}
        devices={[card(ZONE_A), card(ZONE_B, { sampling: 'led', colorSampling: 'vivid' })]}
        zoneCustomizable={false}
        onClose={() => {}}
      />,
    );
    const color = await screen.findByRole('button', { name: 'lighting.ledMap.colorSampling' });
    const sampling = screen.getByRole('button', { name: 'lighting.ledMap.sampling' });
    expect(color.textContent).toContain('lighting.ledMap.colorSamplingVivid');
    expect(color.compareDocumentPosition(sampling) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
