import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as lightingApi from '../../api/lighting';
import { LightingView } from './LightingView';

const setModeMock = vi.hoisted(() => vi.fn());
const setRawSyncMock = vi.hoisted(() => vi.fn());
const profileRef = vi.hoisted(() => ({ current: 'old' }));

vi.mock('../../hooks/useLightingSync', () => ({
  useLightingSync: () => ({
    mode: 'animate',
    setMode: setModeMock,
    rawSync: 'rainbow',
    setRawSync: setRawSyncMock,
    synced: true,
  }),
}));

vi.mock('../../hooks/useLightingFrames', () => ({
  useLightingFrames: () => ({ canvasPixels: null, canvasW: 160, canvasH: 90 }),
}));

vi.mock('../../hooks/useUsbDevices', () => ({
  useUsbDevices: () => ({ devices: [] }),
}));

vi.mock('../../hooks/useAudioState', () => ({
  useAudioState: () => ({ current: null }),
}));

vi.mock('../../hooks/useMultiplexSocket', () => ({
  useTopicCallback: vi.fn(),
}));

vi.mock('../../lib/controlSync', () => ({
  publishControlSync: vi.fn(),
  subscribeControlSync: vi.fn(() => () => {}),
}));

vi.mock('../../api/lighting', async importOriginal => {
  const actual = await importOriginal<typeof import('../../api/lighting')>();
  return {
    ...actual,
    fetchCurrentSync: vi.fn(() => Promise.resolve({ sync: profileRef.current === 'old' ? 'rainbow' : 'plasma' })),
    fetchAnimateSettings: vi.fn(() => Promise.resolve(profileRef.current === 'old'
      ? makeAnimateSettings('rainbow', 41)
      : makeAnimateSettings('plasma', 77))),
    fetchStaticColor: vi.fn(() => Promise.resolve({ r: 10, g: 20, b: 30 })),
    fetchMusicReactive: vi.fn(() => Promise.resolve({ enabled: false })),
    fetchScreenEffect: vi.fn(() => Promise.resolve({ hue: 0, colorize: 0, saturation: 1, contrast: 1 })),
    fetchMediaEffect: vi.fn(() => Promise.resolve({ hue: 0, colorize: 0, saturation: 1, contrast: 1 })),
    fetchLightingDevices: vi.fn(() => Promise.resolve({ isInit: true, devices: [] })),
    fetchLedMap: vi.fn(() => Promise.resolve(null)),
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
  };
});

vi.mock('../common/ViewHeader/ViewHeader', () => ({
  ViewHeader: () => <div data-testid="view-header" />,
}));

vi.mock('./ServiceRequired', () => ({
  ServiceRequired: () => <div data-testid="service-required" />,
}));

vi.mock('./PageSkeleton/PageSkeleton', () => ({
  LightingSkeleton: () => <div data-testid="lighting-skeleton" />,
}));

vi.mock('../common/DeviceCanvas/DeviceCanvas', () => ({
  DeviceCanvas: () => <div data-testid="device-canvas" />,
}));

vi.mock('../common/SupportedDevicesModal/SupportedDevicesModal', () => ({
  SupportedDevicesModal: () => null,
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

vi.mock('./lighting/RescanDevicesButton', () => ({
  RescanDevicesButton: () => <div data-testid="rescan" />,
}));

vi.mock('./lighting/RgbStatusCard', () => ({
  RgbStatusCard: () => <div data-testid="rgb-status" />,
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

describe('LightingView profile switching', () => {
  beforeEach(() => {
    profileRef.current = 'old';
    vi.clearAllMocks();
  });

  it('replays the freshly loaded profile effect instead of stale rawSync', async () => {
    const { rerender } = render(
      <LightingView serviceOnline serviceState={{ cooling: null, lighting: null, panel: null }} activeProfileId="old" />,
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
    rerender(<LightingView serviceOnline serviceState={{ cooling: null, lighting: null, panel: null }} activeProfileId="new" />);

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
