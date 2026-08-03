import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as lightingApi from '../../../api/lighting';
import { LightingPage } from './LightingPage';

const setModeMock = vi.hoisted(() => vi.fn());
const setRawSyncMock = vi.hoisted(() => vi.fn());
const profileRef = vi.hoisted(() => ({ current: 'old' }));

vi.mock('../../../hooks/useLightingSync', async (importOriginal) => ({
  // normalizeSync is the shared sync-string classifier; keep the real one so
  // the page maps modes the way production does.
  ...(await importOriginal<typeof import('../../../hooks/useLightingSync')>()),
  useLightingSync: () => ({
    mode: 'animate',
    setMode: setModeMock,
    rawSync: 'rainbow',
    setRawSync: setRawSyncMock,
    synced: true,
    paused: false,
  }),
}));

vi.mock('../../../hooks/useLightingFrames', () => ({
  useLightingFrames: () => ({ canvasPixels: null, canvasW: 160, canvasH: 90 }),
}));

vi.mock('../../../hooks/useUsbDevices', () => ({
  useUsbDevices: () => ({ devices: [] }),
}));

vi.mock('../../../hooks/useAudioState', () => ({
  useAudioState: () => ({ current: null }),
}));

vi.mock('../../../hooks/useMultiplexSocket', () => ({
  useTopicCallback: vi.fn(),
  useTopic: vi.fn(() => null),
}));

vi.mock('../../../lib/controlSync', () => ({
  publishControlSync: vi.fn(),
  subscribeControlSync: vi.fn(() => () => {}),
}));

vi.mock('../../../api/lighting', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../api/lighting')>();
  return {
    ...actual,
    fetchCurrentSync: vi.fn(() => Promise.resolve({ sync: profileRef.current === 'old' ? 'rainbow' : 'plasma' })),
    fetchAnimateDefaults: vi.fn(() => Promise.resolve(null)),
    cachedAnimateDefaults: vi.fn(() => null),
    fetchAnimateSettings: vi.fn(() => Promise.resolve(profileRef.current === 'old'
      ? makeAnimateSettings('rainbow', 41)
      : makeAnimateSettings('plasma', 77))),
    fetchStaticColor: vi.fn(() => Promise.resolve({ r: 10, g: 20, b: 30 })),
    fetchMusicReactive: vi.fn(() => Promise.resolve({ enabled: false })),
    fetchScreenEffect: vi.fn(() => Promise.resolve({ hue: 0, colorize: 0, saturation: 1, contrast: 1 })),
    fetchMediaEffect: vi.fn(() => Promise.resolve({ hue: 0, colorize: 0, saturation: 1, contrast: 1 })),
    fetchLightingDevices: vi.fn(() => Promise.resolve({ isInit: true, devices: [] })),
    fetchLedMap: vi.fn(() => Promise.resolve(null)),
    fetchAvailableMappings: vi.fn(() => Promise.resolve(null)),
    saveAnimateTemplates: vi.fn(() => Promise.resolve(null)),
    startAnimate: vi.fn(() => Promise.resolve(null)),
    startStatic: vi.fn(() => Promise.resolve(null)),
    startScreenMirror: vi.fn(() => Promise.resolve(null)),
    stopLighting: vi.fn(() => Promise.resolve(null)),
    setMusicReactive: vi.fn(() => Promise.resolve(null)),
    setLightingDevicePower: vi.fn(() => Promise.resolve(null)),
    setScreenEffect: vi.fn(() => Promise.resolve(null)),
    setMediaEffect: vi.fn(() => Promise.resolve(null)),
    saveDeviceLayout: vi.fn(() => Promise.resolve(null)),
    fetchLayoutPresets: vi.fn(() => Promise.resolve(null)),
    createLayoutPreset: vi.fn(() => Promise.resolve(null)),
    updateLayoutPreset: vi.fn(() => Promise.resolve(null)),
    deleteLayoutPreset: vi.fn(() => Promise.resolve(null)),
    setActiveLayoutPreset: vi.fn(() => Promise.resolve(null)),
    activateLayoutPreset: vi.fn(() => Promise.resolve(null)),
    applyDeviceLayouts: vi.fn(() => Promise.resolve(null)),
    resetDeviceLayouts: vi.fn(() => Promise.resolve(null)),
  };
});

vi.mock('../../../components/common/ViewHeader/ViewHeader', () => ({
  ViewHeader: () => <div data-testid="view-header" />,
}));

vi.mock('../../../components/views/ServiceRequired', () => ({
  ServiceRequired: () => <div data-testid="service-required" />,
}));

vi.mock('../../../components/views/PageSkeleton/PageSkeleton', () => ({
  LightingSkeleton: () => <div data-testid="lighting-skeleton" />,
}));

vi.mock('../../../components/common/DeviceCanvas/DeviceCanvas', () => ({
  DeviceCanvas: () => <div data-testid="device-canvas" />,
}));

vi.mock('./lighting/AnimateGrid', () => ({
  AnimateGrid: () => <div data-testid="animate-grid" />,
}));

vi.mock('./lighting/FullscreenShader', () => ({
  FullscreenShader: () => null,
}));

vi.mock('./lighting/ModeControls', () => ({
  ModeControls: () => <div data-testid="mode-controls" />,
}));

vi.mock('./lighting/DevicePanel', () => ({
  DevicePanel: () => <div data-testid="device-panel" />,
}));

vi.mock('./lighting/LedMapEditor', () => ({
  LedMapEditor: () => null,
}));

vi.mock('./lighting/RightPaneTabs', () => ({
  RightPaneTabs: () => <div data-testid="right-pane-tabs" />,
}));

vi.mock('./lighting/EffectTab', () => ({
  EffectTab: () => <div data-testid="effect-tab" />,
}));

function makeAnimateSettings(effect: string, speed: number) {
  return {
    effect,
    states: {},
    templates: {
      [effect]: {
        selected: 0,
        slots: [{
          speed,
          intensity: 1,
          hue: 0.25,
          colorize: 0.5,
          saturation: 1.1,
          contrast: 1.2,
          params: { u_zoom: 2 },
        }],
      },
    },
  };
}

describe('LightingPage profile switching', () => {
  beforeEach(() => {
    profileRef.current = 'old';
    vi.clearAllMocks();
  });

  it('replays the freshly loaded profile effect instead of stale rawSync', async () => {
    const { rerender } = render(
      <LightingPage serviceOnline serviceState={{ cooling: null, lighting: null, panel: null }} activeProfileId="old" />,
    );

    await waitFor(() => {
      expect(lightingApi.startAnimate).toHaveBeenCalledWith(
        'rainbow',
        41,
        1,
        0.25,
        0.5,
        1.1,
        1.2,
        expect.objectContaining({ u_zoom: 2 }),
        false,
      );
    });
    vi.mocked(lightingApi.startAnimate).mockClear();

    profileRef.current = 'new';
    rerender(<LightingPage serviceOnline serviceState={{ cooling: null, lighting: null, panel: null }} activeProfileId="new" />);

    await waitFor(() => {
      expect(lightingApi.startAnimate).toHaveBeenCalledWith(
        'plasma',
        77,
        1,
        0.25,
        0.5,
        1.1,
        1.2,
        expect.objectContaining({ u_zoom: 2 }),
        false,
      );
    });

    expect(vi.mocked(lightingApi.startAnimate).mock.calls.some(call => call[0] === 'rainbow')).toBe(false);
  });
});

describe('LightingPage preset toolbar placement', () => {
  beforeEach(() => {
    profileRef.current = 'old';
    vi.clearAllMocks();
    // The page persists the active right-pane tab; without this the Effect-tab
    // precondition depends on what an earlier test left behind.
    localStorage.clear();
  });

  // The preset carries the mode + effect selection, so its control sits at the
  // top of the right pane, above the Devices | Effect selector.
  it('renders the preset toolbar while the Effect tab is active', async () => {
    // t() is unmocked here and echoes keys, so queries name the key.
    const { findByLabelText, getByRole } = render(
      <LightingPage serviceOnline serviceState={{ cooling: null, lighting: null, panel: null }} activeProfileId="old" />,
    );

    expect(getByRole('radio', { name: 'lighting.rightPane.effect' }).getAttribute('aria-checked')).toBe('true');
    expect(await findByLabelText('lighting.layoutPresets.placeholder')).toBeTruthy();
  });
});
