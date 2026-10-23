import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchMusicReactive, fetchPins, type Pin } from '../../../api/lighting';
import { UiSettingsProvider } from '../../../hooks/useUiSettings';
import { LightingPage } from './LightingPage';

const topicHandlers = vi.hoisted(() => ({ lighting: [] as (() => void)[] }));
const syncState = vi.hoisted(() => ({ mode: 'static', rawSync: 'static' }));
const audioOutputEnabled = vi.hoisted(() => ({ calls: [] as boolean[] }));
const audioState = vi.hoisted(() => ({ enabled: [] as boolean[] }));

vi.mock('../../../hooks/useLightingSync', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../hooks/useLightingSync')>()),
  useLightingSync: () => ({
    mode: syncState.mode,
    setMode: vi.fn(),
    rawSync: syncState.rawSync,
    setRawSync: vi.fn(),
    synced: true,
    paused: false,
  }),
}));

vi.mock('../../../hooks/useMultiplexSocket', () => ({
  useTopicCallback: (topic: string, enabled: boolean, cb: () => void) => {
    if (topic === 'lighting' && enabled && !topicHandlers.lighting.includes(cb)) {
      topicHandlers.lighting.push(cb);
    }
  },
  useTopic: vi.fn(() => null),
}));

vi.mock('../../../hooks/useLightingFrames', () => ({
  useLightingFrames: () => ({ connected: false, live: false }),
}));
vi.mock('../../../hooks/useUsbDevices', () => ({ useUsbDevices: () => ({ devices: [] }) }));
vi.mock('../../../hooks/useAudioState', () => ({
  useAudioState: (enabled: boolean) => { audioState.enabled.push(enabled); return { current: null }; },
}));
vi.mock('../../../hooks/useLightingAudioOutput', () => ({
  useLightingAudioOutput: (enabled: boolean) => {
    audioOutputEnabled.calls.push(enabled);
    return { value: 'output:', options: [{ value: 'output:', label: 'Speakers' }], select: vi.fn() };
  },
}));
vi.mock('../../../lib/controlSync', () => ({
  publishControlSync: vi.fn(),
  subscribeControlSync: vi.fn(() => () => {}),
}));

// The selection the page hands the grid is the thing under test, so the stub
// renders it instead of the real cells.
vi.mock('./page/AnimateGrid', () => ({
  AnimateGrid: ({ effect, onSelect, pinnedDevices }: {
    effect: string;
    onSelect?: (key: string) => void;
    pinnedDevices?: ReadonlyMap<string, readonly string[]>;
  }) => (
    <div>
      <div data-testid="grid-effect" onClick={() => onSelect?.('stripes')}>{effect}</div>
      <div data-testid="grid-pins">{[...(pinnedDevices ?? [])].map(([k, v]) => `${k}=${v.join('+')}`).join(';')}</div>
    </div>
  ),
}));
vi.mock('./page/FullscreenShader', () => ({
  FullscreenShader: ({ effect, onPrev }: { effect: string; onPrev: () => void }) => (
    <div data-testid="fullscreen" data-effect={effect}>
      <button type="button" onClick={onPrev}>fs-prev</button>
    </div>
  ),
}));
vi.mock('./page/ModeControls', () => ({
  ModeControls: ({ mode, onSelectionPick, keepMode, onBlockedPick }: { mode: string; onSelectionPick?: () => void; keepMode?: boolean; onBlockedPick?: () => void }) => (
    <div data-testid="mode-controls" data-mode={mode} data-keep-mode={String(!!keepMode)} data-blocked={String(!!onBlockedPick)}>
      {onSelectionPick && <button type="button" onClick={onSelectionPick}>selection-pick</button>}
    </div>
  ),
}));
vi.mock('./page/StaticPickerCanvas', () => ({
  StaticPickerCanvas: ({ onCommit, onPreview, hex, devices, implied, patternEffect }: {
    onCommit: (hex: string) => void;
    onPreview: (hex: string) => void;
    hex: string;
    devices: { id: string; hex: string; pinned?: boolean }[];
    implied?: boolean;
    patternEffect?: string | null;
  }) => (
    <div data-pick data-testid="picker-field">
      <span data-testid="picker-hex">{hex}</span>
      <span data-testid="picker-pattern">{patternEffect ?? ''}</span>
      <span data-testid="picker-marks" data-implied={implied ? '1' : ''}>{devices.map(d => `${d.id}@${d.hex}${d.pinned ? '(pinned)' : ''}`).join(';')}</span>
      <button type="button" onClick={() => onCommit('#00ff00')}>pick-green</button>
      <button type="button" onClick={() => onPreview('#0000ff')}>preview-blue</button>
    </div>
  ),
}));
// The stub exposes what the pins ride on: the pins the rail is handed, the
// source a press pins to, the disabled reason, and the callbacks.
vi.mock('./page/DevicePanel', () => ({
  DevicePanel: ({ pins, pinSource, pinDisabledReason, pinTargetName, onSetPin, onSetSelection, pickTargetIds, pulse }: {
    pins?: Record<string, Pin>;
    pinSource?: string | null;
    pinDisabledReason?: string;
    pinTargetName?: (pin: Pin) => string;
    onSetPin?: (ids: string[], pinned: boolean) => void;
    onSetSelection: (ids: Set<string>, primary: string | null) => void;
    pickTargetIds?: ReadonlySet<string>;
    pulse?: { ids: ReadonlySet<string>; seq: number };
  }) => (
    <div
      data-testid="rail"
      data-targets={pickTargetIds ? [...pickTargetIds].join(',') : 'none'}
      data-pulse={pulse ? `${[...pulse.ids].join(',')}#${pulse.seq}` : ''}
      data-pin={pins?.a ? JSON.stringify(pins.a) : ''}
      data-pin-name={pins?.a && pinTargetName ? pinTargetName(pins.a) : ''}
      data-source={pinSource ?? ''}
      data-disabled={pinDisabledReason ?? ''}
    >
      <button type="button" onClick={() => onSetPin?.(['a'], !pins?.a)}>toggle</button>
      <button type="button" onClick={() => onSetSelection(new Set(['a']), 'a')}>select-a</button>
      <button type="button" onClick={() => onSetSelection(new Set(['a', 'b']), 'a')}>select-ab</button>
      <button type="button" onClick={() => onSetSelection(new Set(['b', 'a']), 'b')}>select-ba</button>
      <button type="button" onClick={() => onSetSelection(new Set(), null)}>clear-selection</button>
    </div>
  ),
}));
vi.mock('./page/LedMapEditor', () => ({ LedMapEditor: () => null }));
vi.mock('./page/MediaBackdrop', () => ({ MediaBackdrop: () => <div data-testid="media-backdrop" /> }));
vi.mock('./page/MirrorBackdrop', () => ({ MirrorBackdrop: () => <div data-testid="mirror-backdrop" /> }));
vi.mock('./page/RightPaneTabs', () => ({ RightPaneTabs: () => null }));
// A typed slider edit is onChange(v, true) followed synchronously by onCommit.
vi.mock('./page/EffectTab', () => ({
  EffectTab: ({ mode, effect, state, onAnimateChange, onAnimateCommit }: {
    mode: string;
    effect: string;
    state: { intensity: number } | null;
    onAnimateChange: (patch: { intensity: number }, commit?: boolean) => void;
    onAnimateCommit: () => void;
  }) => (
    <button
      type="button"
      data-testid="type-intensity"
      data-mode={mode}
      data-effect={effect}
      data-intensity={state?.intensity}
      onClick={() => { onAnimateChange({ intensity: 0.3 }, true); onAnimateCommit(); }}
    >type</button>
  ),
}));
vi.mock('../../../components/common/ViewHeader/ViewHeader', () => ({
  ViewHeader: ({ tabs, activeTab, onTabChange, onTabHover }: {
    tabs?: { key: string }[];
    activeTab?: string;
    onTabChange?: (key: string) => void;
    onTabHover?: (key: string | null) => void;
  }) => (
    <div data-testid="tabs" data-active={activeTab ?? ''}>
      {tabs?.map(tab => (
        <button
          key={tab.key}
          type="button"
          onClick={() => onTabChange?.(tab.key)}
          onMouseEnter={() => onTabHover?.(tab.key)}
          onMouseLeave={() => onTabHover?.(null)}
        >{`tab:${tab.key}`}</button>
      ))}
    </div>
  ),
}));
vi.mock('../../../components/views/ServiceRequired', () => ({ ServiceRequired: () => null }));
vi.mock('../../../components/common/DeviceCanvas/DeviceCanvas', () => ({
  DeviceCanvas: ({ shaderEffect, backdrop, foreignFrames }: { shaderEffect?: string | null; backdrop?: React.ReactNode; foreignFrames?: ReadonlyMap<string, string> }) => (
    <div data-testid="preview" data-effect={shaderEffect ?? ''} data-foreign={[...(foreignFrames ?? [])].map(([id, mode]) => `${id}:${mode}`).sort().join(',')}>{backdrop}</div>
  ),
}));

vi.mock('../../../api/lighting', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../api/lighting')>();
  return {
    ...actual,
    fetchCurrentSync: vi.fn(() => Promise.resolve({ sync: syncState.rawSync })),
    fetchAnimateSettings: vi.fn(() => Promise.resolve({ effect: 'fire', states: {}, templates: {} })),
    fetchStaticSettings: vi.fn(() => Promise.resolve({ effect: 'checker', states: {} })),
    fetchAnimateDefaults: vi.fn(() => Promise.resolve(null)),
    cachedAnimateDefaults: vi.fn(() => null),
    fetchMusicReactive: vi.fn(() => Promise.resolve({ enabled: true })),
    fetchScreenEffect: vi.fn(() => Promise.resolve({ hue: 0, colorize: 0, saturation: 1, contrast: 1 })),
    fetchMediaEffect: vi.fn(() => Promise.resolve({ hue: 0, colorize: 0, saturation: 1, contrast: 1 })),
    fetchLightingDevices: vi.fn(() => Promise.resolve({ isInit: true, devices: [{ id: 'a', name: 'Fan A', ledsOn: true, ledCount: 10, canvasX: 0, canvasY: 0, canvasW: 1, canvasH: 1, canvasRotation: 0 }] })),
    fetchLedMap: vi.fn(() => Promise.resolve(null)),
    fetchAvailableMappings: vi.fn(() => Promise.resolve(null)),
    fetchLayoutPresets: vi.fn(() => Promise.resolve(null)),
    saveAnimateTemplates: vi.fn(() => Promise.resolve(null)),
    startAnimate: vi.fn(() => Promise.resolve(null)),
    startStatic: vi.fn(() => Promise.resolve(null)),
    startScreenMirror: vi.fn(() => Promise.resolve(null)),
    stopLighting: vi.fn(() => Promise.resolve(null)),
    setMusicReactive: vi.fn(() => Promise.resolve(null)),
    setPins: vi.fn(() => Promise.resolve(true)),
    fetchPins: vi.fn(() => Promise.resolve({})),
  };
});

const serviceState = { cooling: null, lighting: null, panel: null } as never;

const renderPage = (platform = 'windows') => render(
  <UiSettingsProvider>
    <LightingPage serviceOnline serviceState={serviceState} activeProfileId="p1" platform={platform} />
  </UiSettingsProvider>,
);

const musicButton = () => screen.queryByRole('button', { name: 'lighting.musicReactive' });
const sourcePicker = () => screen.queryByRole('button', { name: 'lighting.audioOutput.label' });

// The service runs Static; the Animation tab is opened on a selection pinned to
// an effect, so the canvas shows that effect and its music button.
async function showPinned(effect: string) {
  vi.mocked(fetchPins).mockImplementation(() => Promise.resolve({ a: { kind: 'animate', effect } }) as never);
  renderPage();
  await waitFor(() => expect(screen.getByTestId('rail').dataset.pin).not.toBe(''));
  fireEvent.click(screen.getByText('select-a'));
  fireEvent.click(screen.getByText('tab:animate'));
}

describe('LightingPage music reactive source picker', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('nexus_settings', JSON.stringify({ general: { lightingDashboardMode: 'advanced', coolingDashboardMode: 'advanced' } }));
    syncState.mode = 'static';
    syncState.rawSync = 'static';
    audioOutputEnabled.calls.length = 0;
    audioState.enabled.length = 0;
    topicHandlers.lighting.length = 0;
    vi.mocked(fetchMusicReactive).mockImplementation(() => Promise.resolve({ enabled: true }) as never);
  });
  afterEach(cleanup);

  it('shows the picker beside the music button for a pinned audio effect while the running mode is Static', async () => {
    await showPinned('spectrumbars');

    await waitFor(() => expect(musicButton()).toBeInTheDocument());
    await waitFor(() => expect(sourcePicker()).toBeInTheDocument());
    expect(audioOutputEnabled.calls.at(-1)).toBe(true);
    expect(audioState.enabled.at(-1)).toBe(true);
  });

  it('hides the picker, and stops polling devices, when Music Reactive is off', async () => {
    vi.mocked(fetchMusicReactive).mockImplementation(() => Promise.resolve({ enabled: false }) as never);
    await showPinned('spectrumbars');

    await waitFor(() => expect(musicButton()).toBeInTheDocument());
    expect(sourcePicker()).not.toBeInTheDocument();
    expect(audioOutputEnabled.calls.every(Boolean)).toBe(true);
  });

  it('shows neither for a pinned effect that is not audio-reactive', async () => {
    await showPinned('aurora');

    await waitFor(() => expect(screen.getByTestId('preview').dataset.effect).toBe('aurora'));
    expect(musicButton()).not.toBeInTheDocument();
    expect(sourcePicker()).not.toBeInTheDocument();
    expect(audioOutputEnabled.calls.every(Boolean)).toBe(true);
  });

  it('hides the picker off Windows', async () => {
    vi.mocked(fetchPins).mockImplementation(() => Promise.resolve({ a: { kind: 'animate', effect: 'spectrumbars' } }) as never);
    renderPage('macos');
    await waitFor(() => expect(screen.getByTestId('rail').dataset.pin).not.toBe(''));
    fireEvent.click(screen.getByText('select-a'));
    fireEvent.click(screen.getByText('tab:animate'));

    await waitFor(() => expect(musicButton()).toBeInTheDocument());
    expect(sourcePicker()).not.toBeInTheDocument();
  });
});
