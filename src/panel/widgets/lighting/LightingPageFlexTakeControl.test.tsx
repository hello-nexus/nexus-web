import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
vi.mock('./page/DevicePanel', () => ({
  DevicePanel: ({ firmwareDeviceIds, onFirmwareTakeControl }: {
    firmwareDeviceIds?: ReadonlySet<string>;
    onFirmwareTakeControl?: (deviceId: string) => void;
  }) => (
    <div data-testid="rail" data-firmware={[...(firmwareDeviceIds ?? [])].sort().join(',')}>
      <button type="button" onClick={() => onFirmwareTakeControl?.('lianli-flex:AA11')}>take-flex</button>
    </div>
  ),
}));
vi.mock('./page/LedMapEditor', () => ({ LedMapEditor: () => null }));
vi.mock('./page/RightPaneTabs', () => ({ RightPaneTabs: () => null }));
vi.mock('./page/EffectTab', () => ({ EffectTab: () => null }));
vi.mock('../../../components/common/ViewHeader/ViewHeader', () => ({ ViewHeader: () => null }));
vi.mock('../../../components/views/ServiceRequired', () => ({ ServiceRequired: () => null }));
vi.mock('../../../components/common/DeviceCanvas/DeviceCanvas', () => ({ DeviceCanvas: () => null }));


// The wireless read fails so the Flex result must survive it.
vi.mock('../../../api/lianli-wireless', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../api/lianli-wireless')>()),
  getLianLiWirelessLighting: vi.fn(() => Promise.reject(new Error('offline'))),
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

function renderPage() {
  localStorage.setItem('nexus_settings', JSON.stringify({ general: { lightingDashboardMode: 'advanced', coolingDashboardMode: 'advanced' } }));
  return render(
    <UiSettingsProvider>
      <LightingPage serviceOnline serviceState={serviceState} activeProfileId="p1" platform="windows" />
    </UiSettingsProvider>,
  );
}

describe('LightingPage cards of a wired LCD Flex fan playing its own effect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockPut.mockResolvedValue({ error: false, msg: '' });
    devicesRef.current = [
      { id: 'lianli-flex:AA11:up', deviceId: 'lianli-flex:AA11', name: 'up', ledsOn: true, ledCount: 13, canvasX: 0, canvasY: 0, canvasW: 60, canvasH: 60, canvasRotation: 0 },
    ];
  });

  it('marks the unit as firmware controlled even when the wireless read fails, and take control puts custom mode', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('rail').dataset.firmware).toBe('lianli-flex:AA11');
    });
    fireEvent.click(screen.getByText('take-flex'));
    expect(mockPut).toHaveBeenCalledWith('/devices/lianli-flex/lighting/AA11', { mode: 'custom' });
    await waitFor(() => {
      expect(screen.getByTestId('rail').dataset.firmware).toBe('');
    });
  });
});
