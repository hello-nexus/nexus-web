import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getLianLiWirelessState } from '../../../api/lianli-wireless';
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


vi.mock('../../../api/lianli-wireless', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../api/lianli-wireless')>()),
  getLianLiWirelessLighting: vi.fn(() => Promise.resolve(null)),
  getLianLiWirelessState: vi.fn(),
}));

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

describe('LightingPage unbound wireless cards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    devicesRef.current = [];
    vi.mocked(getLianLiWirelessState).mockResolvedValue({
      isConnected: true,
      masterMac: 'M1',
      channel: 8,
      txFirmwareVersion: 1,
      fans: [{ mac: 'AABBCCDDEEFF', masterMac: '', boundToUs: false, channel: 8, slot: 0, devType: 0, fanType: 24, fanCount: 1, rpm: [], pwm: [] }],
    });
  });

  it('lists an unbound fan and a tap opens the controller page on its row', async () => {
    localStorage.setItem('nexus_settings', JSON.stringify({ general: { lightingDashboardMode: 'advanced', coolingDashboardMode: 'advanced' } }));
    const onSectionNavigate = vi.fn();
    render(
      <UiSettingsProvider>
        <LightingPage serviceOnline serviceState={serviceState} activeProfileId="p1" platform="windows" onSectionNavigate={onSectionNavigate} />
      </UiSettingsProvider>,
    );
    const card = await screen.findByRole('button', { name: /lighting.devices.needsBinding/ });
    fireEvent.click(card);
    expect(onSectionNavigate).toHaveBeenCalledWith('device', {
      deviceKey: 'curated-lianli-wireless',
      scrollAnchors: ['lianli-wireless-device-AABBCCDDEEFF'],
    });
  });
});
