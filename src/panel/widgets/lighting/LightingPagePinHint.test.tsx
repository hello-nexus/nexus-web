import { useEffect } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchLightingDevices, fetchPins, setPins, type Pin } from '../../../api/lighting';
import { dismissOnboardingHint, fetchOnboardingStatus } from '../../../api/onboarding';
import { resetOnboardingHintSession } from '../../../hooks/useOnboardingHint';
import { UiSettingsProvider } from '../../../hooks/useUiSettings';
import { LightingPage } from './LightingPage';

const topicHandlers = vi.hoisted(() => ({ lighting: [] as (() => void)[] }));
const syncState = vi.hoisted(() => ({ mode: 'animate', rawSync: 'fire' }));

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
vi.mock('../../../hooks/useAudioState', () => ({ useAudioState: () => ({ current: null }) }));
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
// The rail stub exposes what the hint rides on: the ids the page marks as
// hint candidates and the callbacks a pin press and the hinted button's press use.
// The title's name is the thing under test, so the key keeps its params.
vi.mock('../../../lib/i18n', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../lib/i18n')>()),
  useTranslation: () => ({ t: (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key), language: 'en' }),
}));
const rail = vi.hoisted(() => ({ order: ['a', 'b'] }));
vi.mock('./page/DevicePanel', () => ({
  DevicePanel: ({ pins, pinHintIds, onPinHintPress, onPinHintTarget, onSetPin, onSetSelection }: {
    pins?: Record<string, Pin>;
    pinHintIds?: ReadonlySet<string>;
    onPinHintPress?: () => void;
    onPinHintTarget?: (id: string | null) => void;
    onSetPin?: (ids: string[], pinned: boolean) => void;
    onSetSelection: (ids: Set<string>, primary: string | null) => void;
  }) => {
    // The real rail points at the top-most hinted pinned card in rail order.
    const target = pinHintIds ? rail.order.find(id => pinHintIds.has(id) && pins?.[id]) ?? null : null;
    useEffect(() => { onPinHintTarget?.(target); }, [onPinHintTarget, target]);
    return (
      <div data-testid="rail" data-pins={Object.keys(pins ?? {}).sort().join(',')} data-hint-ids={pinHintIds ? [...pinHintIds].join(',') : 'none'}>
        <button type="button" onClick={() => onSetSelection(new Set(['a', 'b']), 'a')}>select-ab</button>
        <button type="button" onClick={() => onSetPin?.(['a', 'b'], true)}>pin-ab</button>
        <button type="button" onClick={() => onSetPin?.(['a'], false)}>unpin-a-menu</button>
        <button type="button" onClick={() => { onSetPin?.(['a'], false); onPinHintPress?.(); }}>press-hinted</button>
      </div>
    );
  },
}));
vi.mock('./page/LedMapEditor', () => ({ LedMapEditor: () => null }));
vi.mock('./page/MediaBackdrop', () => ({ MediaBackdrop: () => <div data-testid="media-backdrop" /> }));
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
    fetchMusicReactive: vi.fn(() => Promise.resolve({ enabled: false })),
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

const renderPage = (platform = '') => render(
  <UiSettingsProvider>
    <LightingPage serviceOnline serviceState={serviceState} activeProfileId="p1" platform={platform} />
  </UiSettingsProvider>,
);

const onboarding = vi.hoisted(() => ({ dismissed: [] as string[] }));
vi.mock('../../../api/onboarding', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../api/onboarding')>()),
  fetchOnboardingStatus: vi.fn(() => Promise.resolve({ completed: true, dismissedHints: onboarding.dismissed })),
  dismissOnboardingHint: vi.fn(() => Promise.resolve({ status: 200, body: { completed: true, dismissedHints: ['lighting-pin'] } })),
}));
const shown = vi.hoisted(() => ({ titles: [] as string[] }));
// The real bubble needs layout; a stub exposes what the page passes it.
vi.mock('../../../components/common/Coachmark/Coachmark', () => ({
  Coachmark: (p: { hintId: string; target: string; title: string; body?: string; onDismiss: () => void }) => {
    shown.titles.push(p.title);
    return (
      <div data-testid="coachmark" data-hint-id={p.hintId} data-target={p.target}>
        <span data-testid="coachmark-title">{p.title}</span>
        <span data-testid="coachmark-body">{p.body}</span>
        <button type="button" onClick={p.onDismiss}>coachmark-x</button>
      </div>
    );
  },
}));

const bubble = () => screen.queryByTestId('coachmark');
const railPins = () => screen.getByTestId('rail').dataset.pins;
const dev = (id: string) => ({ id, name: `Fan ${id}`, ledsOn: true, ledCount: 10, canvasX: 0, canvasY: 0, canvasW: 1, canvasH: 1, canvasRotation: 0 });
// Lets the status fetch and the first pins fetch settle.
const settle = async () => {
  await waitFor(() => expect(fetchPins).toHaveBeenCalled());
  await waitFor(() => expect(fetchOnboardingStatus).toHaveBeenCalled());
  await Promise.all([...vi.mocked(fetchPins).mock.results, ...vi.mocked(fetchOnboardingStatus).mock.results, ...vi.mocked(setPins).mock.results].map(r => r.value));
  // One macrotask turn runs every continuation the answers queued; it waits for nothing.
  await new Promise(r => setTimeout(r, 0));
};
const existing = { kind: 'animate', effect: 'plasma' } as Pin;

describe('LightingPage first-pin coachmark', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('nexus_settings', JSON.stringify({ general: { lightingDashboardMode: 'advanced', coolingDashboardMode: 'advanced' } }));
    resetOnboardingHintSession();
    onboarding.dismissed = [];
    syncState.mode = 'animate';
    syncState.rawSync = 'fire';
    topicHandlers.lighting.length = 0;
    rail.order = ['a', 'b'];
    shown.titles.length = 0;
    vi.mocked(setPins).mockClear();
    vi.mocked(dismissOnboardingHint).mockClear();
    vi.mocked(setPins).mockImplementation(() => Promise.resolve(true));
    vi.mocked(fetchPins).mockImplementation(() => Promise.resolve({}));
    vi.mocked(fetchLightingDevices).mockImplementation(
      () => Promise.resolve({ isInit: true, devices: [dev('a'), dev('b')] }) as never,
    );
  });

  it('shows after a user pin, naming the target, and not before', async () => {
    renderPage();
    await settle();
    expect(bubble()).toBeNull();
    fireEvent.click(screen.getByText('pin-ab'));
    await waitFor(() => expect(bubble()).not.toBeNull());
    expect(bubble()?.dataset.hintId).toBe('lighting-pin');
    expect(bubble()?.dataset.target).toBe('[data-coachmark="lighting-pin"]');
    expect(screen.getByTestId('coachmark-title').textContent).toContain('lighting.pin.pinnedTo');
    expect(screen.getByTestId('coachmark-body').textContent).toBe('lighting.pin.hintBody');
    expect(screen.getByTestId('rail').dataset.hintIds).toBe('a,b');
    // Never mounted before the rail named its target.
    expect(shown.titles.length).toBeGreaterThan(0);
    expect(shown.titles.every(title => !title.includes('"name":""'))).toBe(true);
  });

  it('does not show for pins restored from the service, nor for ones arriving on a lighting frame', async () => {
    renderPage();
    await settle();
    vi.mocked(fetchPins).mockImplementation(() => Promise.resolve({ a: existing }));
    topicHandlers.lighting.forEach(cb => cb());
    await waitFor(() => expect(railPins()).toBe('a'));
    expect(bubble()).toBeNull();
    expect(screen.getByTestId('rail').dataset.hintIds).toBe('none');
  });

  it('dismisses silently when pins exist on the first load', async () => {
    vi.mocked(fetchPins).mockImplementation(() => Promise.resolve({ a: existing }));
    renderPage();
    await waitFor(() => expect(dismissOnboardingHint).toHaveBeenCalledWith('lighting-pin'));
    expect(bubble()).toBeNull();
    // A later user pin does not bring it back.
    fireEvent.click(screen.getByText('pin-ab'));
    await settle();
    expect(bubble()).toBeNull();
  });

  it('stays silent and unsent when the hint was already dismissed', async () => {
    onboarding.dismissed = ['lighting-pin'];
    renderPage();
    await settle();
    fireEvent.click(screen.getByText('pin-ab'));
    await settle();
    expect(setPins).toHaveBeenCalledTimes(1);
    expect(bubble()).toBeNull();
    expect(dismissOnboardingHint).not.toHaveBeenCalled();
  });

  it('shows no bubble when the pin write fails', async () => {
    vi.mocked(setPins).mockImplementation(() => Promise.resolve(false));
    renderPage();
    await settle();
    fireEvent.click(screen.getByText('pin-ab'));
    await settle();
    expect(setPins).toHaveBeenCalledTimes(1);
    expect(bubble()).toBeNull();
    expect(dismissOnboardingHint).not.toHaveBeenCalled();
  });

  it('dismisses through the X', async () => {
    renderPage();
    await settle();
    fireEvent.click(screen.getByText('pin-ab'));
    await waitFor(() => expect(bubble()).not.toBeNull());
    fireEvent.click(screen.getByText('coachmark-x'));
    expect(bubble()).toBeNull();
    expect(dismissOnboardingHint).toHaveBeenCalledTimes(1);
    expect(dismissOnboardingHint).toHaveBeenCalledWith('lighting-pin');
  });

  it('dismisses when the hinted pin button is pressed, even with another device still pinned', async () => {
    renderPage();
    await settle();
    fireEvent.click(screen.getByText('pin-ab'));
    await waitFor(() => expect(bubble()).not.toBeNull());
    fireEvent.click(screen.getByText('press-hinted'));
    await waitFor(() => expect(dismissOnboardingHint).toHaveBeenCalledTimes(1));
    expect(bubble()).toBeNull();
    expect(railPins()).toBe('b');
    expect(dismissOnboardingHint).toHaveBeenCalledWith('lighting-pin');
  });

  it('dismisses once every hinted device is unpinned by another path, and not before', async () => {
    renderPage();
    await settle();
    fireEvent.click(screen.getByText('pin-ab'));
    await waitFor(() => expect(bubble()).not.toBeNull());
    fireEvent.click(screen.getByText('unpin-a-menu'));
    await settle();
    expect(railPins()).toBe('b');
    expect(bubble()).not.toBeNull();
    expect(dismissOnboardingHint).not.toHaveBeenCalled();
    // The service reports b unpinned (another client or the bulk menu).
    vi.mocked(fetchPins).mockImplementation(() => Promise.resolve({}));
    topicHandlers.lighting.forEach(cb => cb());
    // The bubble can unmount a flush before the dismiss effect runs, so wait on the call.
    await waitFor(() => expect(dismissOnboardingHint).toHaveBeenCalledTimes(1));
    expect(bubble()).toBeNull();
    expect(dismissOnboardingHint).toHaveBeenCalledWith('lighting-pin');
  });

  it('names the title from the card the bubble points at, not the first pinned', async () => {
    rail.order = ['b', 'a'];
    renderPage();
    await settle();
    fireEvent.click(screen.getByText('pin-ab'));
    await waitFor(() => expect(bubble()).not.toBeNull());
    const both = screen.getByTestId('coachmark-title').textContent;
    // Another client moves b to a different pin; b is still the top-most hinted card.
    vi.mocked(fetchPins).mockImplementation(() => Promise.resolve({ a: { kind: 'animate', effect: 'fire' }, b: { kind: 'animate', effect: 'plasma' } }));
    topicHandlers.lighting.forEach(cb => cb());
    await waitFor(() => expect(screen.getByTestId('coachmark-title').textContent).not.toBe(both));
    expect(screen.getByTestId('coachmark-title').textContent).toMatch(/plasma/i);
    expect(screen.getByTestId('coachmark-title').textContent).not.toMatch(/fire/i);
  });
});
