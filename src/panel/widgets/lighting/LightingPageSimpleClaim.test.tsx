import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UiSettingsProvider } from '../../../hooks/useUiSettings';
import { LightingPage } from './LightingPage';
import * as lightingApi from '../../../api/lighting';

vi.mock('../../../hooks/useLightingSync', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../hooks/useLightingSync')>()),
  useLightingSync: () => ({ mode: 'static', setMode: vi.fn(), rawSync: '', setRawSync: vi.fn(), synced: true, paused: false }),
}));
vi.mock('../../../hooks/useLightingFrames', () => ({ useLightingFrames: () => ({ connected: false, live: false }) }));
vi.mock('../../../hooks/useUsbDevices', () => ({ useUsbDevices: () => ({ devices: [] }) }));
vi.mock('../../../hooks/useAudioState', () => ({ useAudioState: () => ({ current: null }) }));
vi.mock('../../../hooks/useMultiplexSocket', () => ({ useTopicCallback: vi.fn(), useTopic: vi.fn(() => null) }));
vi.mock('../../../lib/controlSync', () => ({ publishControlSync: vi.fn(), subscribeControlSync: vi.fn(() => () => {}) }));

vi.mock('../../../components/views/ServiceRequired', () => ({ ServiceRequired: () => null }));
vi.mock('../../../components/views/PageSkeleton/PageSkeleton', () => ({ LightingSkeleton: () => null }));

const DEVICE = {
  id: 'openrgb-0', name: 'Strip', ledsOn: false, ledCount: 8, controlled: false,
  canvasX: 0, canvasY: 0, canvasW: 1, canvasH: 1, canvasRotation: 0,
};

vi.mock('../../../api/lighting', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../api/lighting')>();
  return {
    ...actual,
    fetchCurrentSync: vi.fn(() => Promise.resolve({ sync: '' })),
    fetchAnimateDefaults: vi.fn(() => Promise.resolve(null)),
    cachedAnimateDefaults: vi.fn(() => null),
    fetchAnimateSettings: vi.fn(() => Promise.resolve(null)),
    fetchStaticColor: vi.fn(() => Promise.resolve({ r: 0, g: 0, b: 0 })),
    fetchStaticSettings: vi.fn(() => Promise.resolve(null)),
    fetchMusicReactive: vi.fn(() => Promise.resolve({ enabled: false })),
    fetchScreenEffect: vi.fn(() => Promise.resolve({ hue: 0, colorize: 0, saturation: 1, contrast: 1 })),
    fetchMediaEffect: vi.fn(() => Promise.resolve({ hue: 0, colorize: 0, saturation: 1, contrast: 1 })),
    fetchLightingDevices: vi.fn(() => Promise.resolve({ isInit: true, devices: [DEVICE] })),
    fetchLedMap: vi.fn(() => Promise.resolve(null)),
    fetchAvailableMappings: vi.fn(() => Promise.resolve(null)),
    fetchLayoutPresets: vi.fn(() => Promise.resolve(null)),
    setLightingDeviceControlled: vi.fn(() => Promise.resolve(null)),
    setLightingDevicePower: vi.fn(() => Promise.resolve(null)),
    setLightingDeviceColor: vi.fn(() => Promise.resolve(null)),
    stopLighting: vi.fn(() => Promise.resolve(null)),
    startStatic: vi.fn(() => Promise.resolve(null)),
    startAnimate: vi.fn(() => Promise.resolve(null)),
  };
});

function renderSimple() {
  localStorage.setItem('nexus_settings', JSON.stringify({ general: { lightingDashboardMode: 'simple' } }));
  return render(
    <UiSettingsProvider>
      <LightingPage serviceOnline serviceState={{ cooling: null, lighting: null, panel: null }} activeProfileId="p" />
    </UiSettingsProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe('LightingPage simple mode device claiming', () => {
  it('leaves devices alone until the user asks for something', async () => {
    renderSimple();
    await screen.findByRole('tab');

    // Arriving on the page is not a decision about which devices Nexus drives.
    await waitFor(() => expect(lightingApi.fetchLightingDevices).toHaveBeenCalled());
    expect(lightingApi.setLightingDeviceControlled).not.toHaveBeenCalled();
    expect(lightingApi.setLightingDevicePower).not.toHaveBeenCalled();
  });

  it('claims every device when the user presses off', async () => {
    renderSimple();
    fireEvent.click(await screen.findByRole('tab'));
    fireEvent.click(screen.getByRole('menuitemradio', { name: /lighting\.mode\.off/ }));

    await waitFor(() => expect(lightingApi.setLightingDeviceControlled).toHaveBeenCalledWith('openrgb-0', true));
    expect(lightingApi.setLightingDevicePower).toHaveBeenCalledWith('openrgb-0', true);
  });

  it('paints the device it just claimed, on the first press', async () => {
    const { container } = renderSimple();
    await waitFor(() => expect(lightingApi.fetchLightingDevices).toHaveBeenCalled());

    const swatch = container.querySelector('[data-palette-id="red-3"]') as HTMLButtonElement;
    fireEvent.click(swatch);

    // The claim and the paint have to agree about which devices are driven;
    // reading the ids captured before the claim skips everything it claimed.
    await waitFor(() => expect(lightingApi.setLightingDeviceColor).toHaveBeenCalled());
    const painted = vi.mocked(lightingApi.setLightingDeviceColor).mock.calls.map(c => c[0]);
    expect(painted).toContain('openrgb-0');
  });

  it('claims nothing when Off is picked while already off', async () => {
    renderSimple();
    await waitFor(() => expect(lightingApi.fetchLightingDevices).toHaveBeenCalled());
    const openMenu = () => fireEvent.click(screen.getByRole('tab'));
    openMenu();
    fireEvent.click(screen.getByRole('menuitemradio', { name: /lighting\.mode\.off/ }));
    await waitFor(() => expect(lightingApi.setLightingDeviceControlled).toHaveBeenCalled());
    vi.mocked(lightingApi.setLightingDeviceControlled).mockClear();

    // Picking it again asks for nothing new, so it takes over nothing.
    openMenu();
    fireEvent.click(screen.getByRole('menuitemradio', { name: /lighting\.mode\.off/ }));
    expect(lightingApi.setLightingDeviceControlled).not.toHaveBeenCalled();
  });
});
