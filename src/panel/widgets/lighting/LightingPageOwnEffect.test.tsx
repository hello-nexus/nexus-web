import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getHydroShift2Lighting, setHydroShift2Lighting } from '../../../api/hydroshift2';
import { fetchLightingDevices } from '../../../api/lighting';
import { getGalahad2Lighting } from '../../../api/lianli-aio';
import { getStrimerLighting, setStrimerLighting } from '../../../api/strimer';
import { UiSettingsProvider } from '../../../hooks/useUiSettings';
import { LightingPage } from './LightingPage';

const devicesRef = vi.hoisted(() => ({ current: [] as unknown[] }));

// Stable setters: the page's profile-load effect lists them as deps.
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
const lightingTopicCallbacks = vi.hoisted(() => ({ latest: new Map<string, () => void>() }));

vi.mock('../../../hooks/useMultiplexSocket', () => ({
  useTopicCallback: (topic: string, _enabled: boolean, cb: () => void) => {
    lightingTopicCallbacks.latest.set(topic, cb);
  },
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
    <div
      data-testid="rail"
      data-firmware={[...(firmwareDeviceIds ?? [])].sort().join(',')}
    >
      <button type="button" onClick={() => onFirmwareTakeControl?.('lianli-hydroshift2')}>take-ring</button>
      <button type="button" onClick={() => onFirmwareTakeControl?.('strimer:gpu')}>take-strimer</button>
    </div>
  ),
}));
vi.mock('./page/LedMapEditor', () => ({ LedMapEditor: () => null }));
vi.mock('./page/RightPaneTabs', () => ({ RightPaneTabs: () => null }));
vi.mock('./page/EffectTab', () => ({ EffectTab: () => null }));
vi.mock('../../../components/common/ViewHeader/ViewHeader', () => ({ ViewHeader: () => null }));
vi.mock('../../../components/views/ServiceRequired', () => ({ ServiceRequired: () => null }));
vi.mock('../../../components/common/DeviceCanvas/DeviceCanvas', () => ({ DeviceCanvas: () => null }));

vi.mock('../../../api/hydroshift2', () => ({
  getHydroShift2Lighting: vi.fn(() => Promise.resolve({ mode: 'rainbow' })),
  setHydroShift2Lighting: vi.fn(() => Promise.resolve({})),
}));
vi.mock('../../../api/lianli-aio', () => ({
  getGalahad2Lighting: vi.fn(() => Promise.resolve({ mode: 'canvas' })),
  setGalahad2Lighting: vi.fn(() => Promise.resolve({})),
}));
vi.mock('../../../api/strimer', () => ({
  getStrimerLighting: vi.fn(() => Promise.resolve({ mode: 'rainbow' })),
  setStrimerLighting: vi.fn(() => Promise.resolve({})),
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

function device(id: string, deviceId: string) {
  return { id, deviceId, name: id, ledsOn: true, ledCount: 8, canvasX: 0, canvasY: 0, canvasW: 60, canvasH: 60, canvasRotation: 0 };
}

function renderPage() {
  localStorage.setItem('nexus_settings', JSON.stringify({ general: { lightingDashboardMode: 'advanced', coolingDashboardMode: 'advanced' } }));
  return render(
    <UiSettingsProvider>
      <LightingPage serviceOnline serviceState={serviceState} activeProfileId="p1" platform="windows" />
    </UiSettingsProvider>,
  );
}

describe('LightingPage cards of devices playing their own effect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    devicesRef.current = [
      device('lianli-hydroshift2:ring', 'lianli-hydroshift2'),
      device('lianli-aio:ring:inner', 'lianli-aio'),
      device('strimer:atx:z0', 'strimer:atx'),
      device('strimer:gpu:z0', 'strimer:gpu'),
    ];
  });

  it('marks the devices not following the Lighting page as firmware controlled', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('rail').dataset.firmware).toBe('lianli-hydroshift2,strimer:atx,strimer:gpu');
    });
  });

  it('take control hands the device to the Lighting page and clears its card state', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('rail').dataset.firmware).toContain('lianli-hydroshift2');
    });

    fireEvent.click(screen.getByText('take-ring'));
    expect(setHydroShift2Lighting).toHaveBeenCalledWith({ mode: 'canvas' });
    fireEvent.click(screen.getByText('take-strimer'));
    expect(setStrimerLighting).toHaveBeenCalledWith({ mode: 'custom' });
    await waitFor(() => {
      expect(screen.getByTestId('rail').dataset.firmware).toBe('');
    });
  });

  it('treats a second Strimer controller like the first', async () => {
    devicesRef.current = [
      device('strimer:atx:z0', 'strimer:atx'),
      device('strimer:2:atx:z0', 'strimer:2:atx'),
      device('strimer:2:gpu:z0', 'strimer:2:gpu'),
    ];
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('rail').dataset.firmware).toBe('strimer:2:atx,strimer:2:gpu,strimer:atx');
    });
  });

  it('picks up a second Strimer that appears after the first', async () => {
    devicesRef.current = [device('strimer:atx:z0', 'strimer:atx')];
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('rail').dataset.firmware).toBe('strimer:atx');
    });
    expect(getStrimerLighting).toHaveBeenCalledTimes(1);

    // The same-family card set grows, as when a second controller is plugged in.
    devicesRef.current = [device('strimer:atx:z0', 'strimer:atx'), device('strimer:2:atx:z0', 'strimer:2:atx')];
    await act(async () => {
      lightingTopicCallbacks.latest.get('devices')?.();
    });
    await waitFor(() => {
      expect(screen.getByTestId('rail').dataset.firmware).toBe('strimer:2:atx,strimer:atx');
    });
  });

  it('reads no device settings when none of those devices is present', async () => {
    devicesRef.current = [device('other', 'other')];
    renderPage();
    // Assert only once the device list has loaded and been applied.
    await waitFor(() => {
      expect(vi.mocked(fetchLightingDevices)).toHaveBeenCalled();
    });
    await vi.mocked(fetchLightingDevices).mock.results[0].value;
    await act(async () => {});
    expect(getHydroShift2Lighting).not.toHaveBeenCalled();
    expect(getGalahad2Lighting).not.toHaveBeenCalled();
    expect(getStrimerLighting).not.toHaveBeenCalled();
  });
});
