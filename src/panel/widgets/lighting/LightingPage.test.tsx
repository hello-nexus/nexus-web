import type { ReactNode } from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as lightingApi from '../../../api/lighting';
import { UiSettingsProvider } from '../../../hooks/useUiSettings';
import { LightingPage } from './LightingPage';

const setModeMock = vi.hoisted(() => vi.fn());
const setRawSyncMock = vi.hoisted(() => vi.fn());
const profileRef = vi.hoisted(() => ({ current: 'old' }));
const devicesRef = vi.hoisted(() => ({ current: [] as unknown[] }));
const canvasDeviceIds = vi.hoisted(() => ({ current: [] as string[] }));
const canvasFocusIds = vi.hoisted(() => ({ current: [] as string[] }));

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
  useLightingFrames: () => ({ connected: false, live: false }),
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
    fetchLightingDevices: vi.fn(() => Promise.resolve({ isInit: true, devices: devicesRef.current })),
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
  // Renders tabActions: the preset toolbar is handed to ViewHeader as a prop,
  // so a stub that drops its children would hide the thing under test.
  ViewHeader: ({ tabActions }: { tabActions?: ReactNode }) => (
    <div data-testid="view-header">{tabActions}</div>
  ),
}));

vi.mock('../../../components/views/ServiceRequired', () => ({
  ServiceRequired: () => <div data-testid="service-required" />,
}));

vi.mock('../../../components/views/PageSkeleton/PageSkeleton', () => ({
  LightingSkeleton: () => <div data-testid="lighting-skeleton" />,
}));

vi.mock('../../../components/common/DeviceCanvas/DeviceCanvas', () => ({
  // Two stand-ins for the canvas gestures that move the focus: a tap on empty
  // space, and a marquee that lands on one frame. Neither may touch the
  // device-list selection.
  DeviceCanvas: ({ devices, selectedIds, onSelectDevice, onSetSelection }: {
    devices: { id: string }[];
    selectedIds: Set<string>;
    onSelectDevice: (id: string | null) => void;
    onSetSelection: (ids: Set<string>, primary: string | null) => void;
  }) => {
    canvasDeviceIds.current = devices.map(d => d.id);
    canvasFocusIds.current = [...selectedIds];
    return (
      <>
        <button type="button" data-testid="device-canvas" onClick={() => onSelectDevice(null)} />
        <button type="button" data-testid="canvas-marquee" onClick={() => onSetSelection(new Set(['dev-a']), 'dev-a')} />
      </>
    );
  },
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
    localStorage.clear();
    // These tests exercise the advanced page; the fresh-install default is simple.
    localStorage.setItem('nexus_settings', JSON.stringify({ general: { lightingDashboardMode: 'advanced', coolingDashboardMode: 'advanced' } }));
  });

  it('replays the freshly loaded profile effect instead of stale rawSync', async () => {
    const { rerender } = render(
      <UiSettingsProvider>
        <LightingPage serviceOnline serviceState={{ cooling: null, lighting: null, panel: null }} activeProfileId="old" />
      </UiSettingsProvider>,
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
    rerender(
      <UiSettingsProvider>
        <LightingPage serviceOnline serviceState={{ cooling: null, lighting: null, panel: null }} activeProfileId="new" />
      </UiSettingsProvider>,
    );

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
    localStorage.clear();
    // These tests exercise the advanced page; the fresh-install default is simple.
    localStorage.setItem('nexus_settings', JSON.stringify({ general: { lightingDashboardMode: 'advanced', coolingDashboardMode: 'advanced' } }));
  });

  // Layout presets carry device geometry, so the control heads the device rail
  // rather than the effect dock it used to share with the device list.
  it('renders the preset toolbar at the top of the device rail', async () => {
    // t() is unmocked here and echoes keys, so queries name the key.
    const { findByLabelText } = render(
      <UiSettingsProvider>
        <LightingPage serviceOnline serviceState={{ cooling: null, lighting: null, panel: null }} activeProfileId="old" />
      </UiSettingsProvider>,
    );

    expect(await findByLabelText('lighting.layoutPresets.placeholder')).toBeTruthy();
  });
});

function makeDevice(id: string, name: string) {
  return {
    id,
    name,
    ledsOn: true,
    ledCount: 8,
    canvasX: 0,
    canvasY: 0,
    canvasW: 10,
    canvasH: 10,
    canvasRotation: 0,
  };
}

// Animate (like media and mirror) drives every device, so the cards lock their
// checkmark on - the selection still varies and is what the canvas draws.
describe('LightingPage selection in a drive-everything mode', () => {
  beforeEach(() => {
    profileRef.current = 'old';
    devicesRef.current = [makeDevice('dev-a', 'Device A'), makeDevice('dev-b', 'Device B')];
    canvasDeviceIds.current = [];
    canvasFocusIds.current = [];
    vi.clearAllMocks();
    localStorage.clear();
    // These tests exercise the advanced page; the fresh-install default is simple.
    localStorage.setItem('nexus_settings', JSON.stringify({ general: { lightingDashboardMode: 'advanced', coolingDashboardMode: 'advanced' } }));
  });

  it('offers select all/none and draws only the selected devices on the canvas', async () => {
    const { findByLabelText } = render(
      <UiSettingsProvider>
        <LightingPage serviceOnline serviceState={{ cooling: null, lighting: null, panel: null }} activeProfileId="old" />
      </UiSettingsProvider>,
    );

    // Seeded selection is everything, so the canvas carries both devices and
    // only "select none" has anything left to do.
    const selectAll = await findByLabelText('lighting.pane.selectAllControlled');
    const selectNone = await findByLabelText('lightingOnboarding.selectNone');
    await waitFor(() => expect(canvasDeviceIds.current).toEqual(['dev-a', 'dev-b']));
    expect(selectAll).toBeDisabled();
    expect(selectNone).not.toBeDisabled();

    fireEvent.click(selectNone);

    await waitFor(() => expect(canvasDeviceIds.current).toEqual([]));
    expect(await findByLabelText('lighting.pane.selectAllControlled')).not.toBeDisabled();

    fireEvent.click(await findByLabelText('lighting.pane.selectAllControlled'));

    await waitFor(() => expect(canvasDeviceIds.current).toEqual(['dev-a', 'dev-b']));
  });

  it('select all includes a device with its lights off', async () => {
    devicesRef.current = [makeDevice('dev-a', 'Device A'), { ...makeDevice('dev-b', 'Device B'), ledsOn: false }];
    const { findByLabelText } = render(
      <UiSettingsProvider>
        <LightingPage serviceOnline serviceState={{ cooling: null, lighting: null, panel: null }} activeProfileId="old" />
      </UiSettingsProvider>,
    );

    fireEvent.click(await findByLabelText('lightingOnboarding.selectNone'));
    await waitFor(() => expect(canvasDeviceIds.current).toEqual([]));
    fireEvent.click(await findByLabelText('lighting.pane.selectAllControlled'));

    await waitFor(() => expect(canvasDeviceIds.current).toEqual(['dev-a', 'dev-b']));
    expect(await findByLabelText('lighting.pane.selectAllControlled')).toBeDisabled();
  });

  it('keeps every selected frame drawn when a canvas click clears the focus', async () => {
    const { findByTestId, findByLabelText } = render(
      <UiSettingsProvider>
        <LightingPage serviceOnline serviceState={{ cooling: null, lighting: null, panel: null }} activeProfileId="old" />
      </UiSettingsProvider>,
    );

    const canvas = await findByTestId('device-canvas');
    await waitFor(() => expect(canvasFocusIds.current).toEqual(['dev-a', 'dev-b']));

    fireEvent.click(canvas);

    // Focus empties (every frame recedes), the frames themselves stay drawn,
    // and the device list keeps its selection - "select none" is still live.
    await waitFor(() => expect(canvasFocusIds.current).toEqual([]));
    expect(canvasDeviceIds.current).toEqual(['dev-a', 'dev-b']);
    expect(await findByLabelText('lightingOnboarding.selectNone')).not.toBeDisabled();
  });

  it('narrows the focus on a canvas marquee, and hands it back on a list change', async () => {
    const { findByTestId, findByLabelText } = render(
      <UiSettingsProvider>
        <LightingPage serviceOnline serviceState={{ cooling: null, lighting: null, panel: null }} activeProfileId="old" />
      </UiSettingsProvider>,
    );

    const marquee = await findByTestId('canvas-marquee');
    await waitFor(() => expect(canvasFocusIds.current).toEqual(['dev-a', 'dev-b']));

    fireEvent.click(marquee);

    // Focus narrows to the swept frame; both frames stay drawn.
    await waitFor(() => expect(canvasFocusIds.current).toEqual(['dev-a']));
    expect(canvasDeviceIds.current).toEqual(['dev-a', 'dev-b']);

    // A device-list change owns the focus again, rather than leaving it stuck
    // on what the marquee swept.
    fireEvent.click(await findByLabelText('lightingOnboarding.selectNone'));
    await waitFor(() => expect(canvasDeviceIds.current).toEqual([]));
    fireEvent.click(await findByLabelText('lighting.pane.selectAllControlled'));

    await waitFor(() => expect(canvasFocusIds.current).toEqual(['dev-a', 'dev-b']));
  });
});
