// The frame-rate cap selector renders only for cards that report support.
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LedMapEditor } from './LedMapEditor';
import styles from './LedMapEditor.module.scss';
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
  postLedPreviewLayout: vi.fn().mockResolvedValue(null),
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
    postLedPreviewLayout: api.postLedPreviewLayout,
    setLightingDeviceBrightness: vi.fn(),
    fetchGlobalBrightness: vi.fn().mockResolvedValue(null),
  };
});

const card = (id: string): LightingDevice => ({
  id, name: id, ledsOn: true, ledCount: 5,
  canvasX: 0, canvasY: 0, canvasW: 1, canvasH: 1, canvasRotation: 0, zoneResizable: false,
});

describe('LedMapEditor frame-rate cap', () => {
  const mount = (extra: Partial<LightingDevice>) =>
    render(
      <LedMapEditor
        deviceId={ZONE_B}
        initialZoneId={ZONE_B}
        devices={[card(ZONE_A), { ...card(ZONE_B), ...extra }]}
        zoneCustomizable={false}
        onClose={() => {}}
      />,
    );

  it('is hidden when the card does not support a cap', async () => {
    mount({});
    await screen.findByLabelText('lighting.ledMap.selectAll');
    expect(screen.queryByLabelText('lighting.ledMap.rateCap')).toBeNull();
  });

  it('shows Off by default when supported', async () => {
    mount({ rateCapSupported: true, maxRateHz: null });
    const select = await screen.findByLabelText('lighting.ledMap.rateCap');
    await waitFor(() => expect(select.textContent).toContain('lighting.ledMap.rateCapOff'));
  });
});

describe('LedMapEditor area sampling boxes', () => {
  it('underlays a box per enabled LED for an area-sampled card', async () => {
    render(
      <LedMapEditor
        deviceId={ZONE_B}
        initialZoneId={ZONE_B}
        devices={[card(ZONE_A), { ...card(ZONE_B), areaSampling: true, areaBoxes: [0, 0, 0.5, 1, 0, 0, 0, 0, 0.5, 0, 1, 1] }]}
        zoneCustomizable={false}
        onClose={() => {}}
      />,
    );
    await screen.findByLabelText('lighting.ledMap.selectAll');
    await waitFor(() => expect(document.querySelectorAll(`.${styles.areaBox}`).length).toBe(2));
  });
  it('follows the boxes the service returns for the draft layout', async () => {
    api.postLedPreviewLayout.mockResolvedValue({ error: false, msg: '', areaBoxes: [0, 0, 0.3, 1, 0.3, 0, 0.6, 1, 0.6, 0, 1, 1] });
    render(
      <LedMapEditor
        deviceId={ZONE_B}
        initialZoneId={ZONE_B}
        devices={[card(ZONE_A), { ...card(ZONE_B), areaSampling: true, areaBoxes: [0, 0, 0.5, 1, 0.5, 0, 1, 1] }]}
        zoneCustomizable={false}
        onClose={() => {}}
      />,
    );
    await waitFor(() => expect(document.querySelectorAll(`.${styles.areaBox}`).length).toBe(3));
    api.postLedPreviewLayout.mockResolvedValue(null);
  });
  it('draws none when the mode is off', async () => {
    render(
      <LedMapEditor
        deviceId={ZONE_B}
        initialZoneId={ZONE_B}
        devices={[card(ZONE_A), { ...card(ZONE_B), areaSampling: false, areaBoxes: null }]}
        zoneCustomizable={false}
        onClose={() => {}}
      />,
    );
    await screen.findByLabelText('lighting.ledMap.selectAll');
    expect(document.querySelectorAll(`.${styles.areaBox}`).length).toBe(0);
  });
});

