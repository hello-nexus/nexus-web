import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UiSettingsProvider } from '../../../hooks/useUiSettings';
import { LightingPage } from './LightingPage';

const devicesRef = vi.hoisted(() => ({ current: [] as unknown[] }));
const mockPut = vi.hoisted(() => vi.fn());

const lightingSync = vi.hoisted(() => ({
  mode: 'animate',
  setMode: vi.fn(),
  rawSync: 'fire',
  setRawSync: vi.fn(),
  synced: true,
  paused: false,
}));

vi.mock('../../../hooks/useLightingSync', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../hooks/useLightingSync')>()),
  useLightingSync: () => lightingSync,
}));
vi.mock('../../../hooks/useMultiplexSocket', () => ({
  useTopicCallback: vi.fn(),
  useTopic: vi.fn(() => null),
}));
vi.mock('../../../hooks/useLightingFrames', () => ({
  useLightingFrames: () => ({ connected: false, live: false }),
}));
vi.mock('../../../hooks/useUsbDevices', () => ({ useUsbDevices: () => ({ devices: [] }) }));
vi.mock('../../../hooks/useAudioState', () => ({ useAudioState: () => ({ current: null }) }));
vi.mock('../../../lib/controlSync', () => ({
  publishControlSync: vi.fn(),
  subscribeControlSync: vi.fn(() => () => {}),
}));

vi.mock('./page/AnimateGrid', () => ({ AnimateGrid: () => null }));
vi.mock('./page/FullscreenShader', () => ({ FullscreenShader: () => null }));
vi.mock('./page/ModeControls', () => ({ ModeControls: () => null }));
vi.mock('./page/LedMapEditor', () => ({ LedMapEditor: () => null }));
vi.mock('./page/RightPaneTabs', () => ({ RightPaneTabs: () => null }));
vi.mock('./page/EffectTab', () => ({ EffectTab: () => null }));
vi.mock('../../../components/common/ViewHeader/ViewHeader', () => ({ ViewHeader: () => null }));
vi.mock('../../../components/views/ServiceRequired', () => ({ ServiceRequired: () => null }));
vi.mock('../../../components/common/DeviceCanvas/DeviceCanvas', () => ({ DeviceCanvas: () => null }));


const decksRef = vi.hoisted(() => ({ current: [] as unknown[] }));
vi.mock('../../../hooks/useStreamDecks', () => ({ useStreamDecks: () => ({ decks: decksRef.current }) }));

vi.mock('../../../api/service', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../api/service')>()),
  fetchService: vi.fn((url: string) => Promise.resolve(url === '/devices/lianli-flex/lighting'
    ? { laneModes: [], chains: [{ mac: 'AA11', mode: 'rainbow' }] }
    : null)),
  putService: (...args: unknown[]) => mockPut(...args),
}));

vi.mock('../../../api/lighting', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../api/lighting')>();
  return {
    ...actual,
    fetchCurrentSync: vi.fn(() => Promise.resolve({ sync: 'fire' })),
    fetchAnimateSettings: vi.fn(() => Promise.resolve({ effect: 'fire', states: {}, templates: {} })),
    fetchStaticSettings: vi.fn(() => Promise.resolve({ effect: 'checker', states: {} })),
    fetchAnimateDefaults: vi.fn(() => Promise.resolve(null)),
    cachedAnimateDefaults: vi.fn(() => null),
    fetchMusicReactive: vi.fn(() => Promise.resolve({ enabled: false })),
    fetchScreenEffect: vi.fn(() => Promise.resolve({ hue: 0, colorize: 0, saturation: 1, contrast: 1 })),
    fetchMediaEffect: vi.fn(() => Promise.resolve({ hue: 0, colorize: 0, saturation: 1, contrast: 1 })),
    fetchLightingDevices: vi.fn(() => Promise.resolve({ isInit: true, devices: devicesRef.current })),
    fetchLedMap: vi.fn(() => Promise.resolve(null)),
    fetchAvailableMappings: vi.fn(() => Promise.resolve(null)),
    fetchLayoutPresets: vi.fn(() => Promise.resolve(null)),
  };
});

const serviceState = { cooling: null, lighting: null, panel: null } as never;

const keyboard = {
  id: 'kb', name: 'Galleon 100 SD', type: 'ledstrip', iconType: 'keyboard', ledsOn: true, controlled: true,
  brightness: 100, hue: 0, saturation: 1, ledCount: 87, canvasX: 0, canvasY: 0, canvasW: 1, canvasH: 1, canvasRotation: 0,
  deviceId: 'corsair-galleon:CC1FE9FF494BD652A4EA3DCFA2B70CBA', saveToDeviceSupported: true,
};

function renderPage(onSectionNavigate = vi.fn()) {
  localStorage.setItem('nexus_settings', JSON.stringify({ general: { lightingDashboardMode: 'advanced', coolingDashboardMode: 'advanced' } }));
  render(
    <UiSettingsProvider>
      <LightingPage serviceOnline serviceState={serviceState} activeProfileId="p1" platform="windows" onSectionNavigate={onSectionNavigate} />
    </UiSettingsProvider>,
  );
  return onSectionNavigate;
}

describe('LightingPage Galleon save-colors strip', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    devicesRef.current = [keyboard];
    decksRef.current = [{ serial: 'EA3DCFA2B70CBA', displayName: 'Corsair Galleon 100 SD' }];
  });

  it('opens the deck page at the toggle, keyed by the deck serial', async () => {
    const onSectionNavigate = renderPage();
    await screen.findByText('Galleon 100 SD');
    fireEvent.click(await screen.findByText('lighting.devices.saveStrip.keys'));
    expect(onSectionNavigate).toHaveBeenCalledWith('device', {
      deviceKey: 'streamdeck:EA3DCFA2B70CBA',
      scrollAnchors: ['device-galleon-save-to-device'],
    });
  });

  it('hides the strip while no deck pairs with the keyboard', async () => {
    decksRef.current = [];
    renderPage();
    await screen.findByText('Galleon 100 SD');
    expect(screen.queryByText('lighting.devices.saveStrip.keys')).toBeNull();
  });
});
