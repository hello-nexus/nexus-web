import { useEffect } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchPins } from '../../../api/lighting';
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
    pins?: Record<string, unknown>;
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


vi.mock('../../../api/onboarding', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../api/onboarding')>()),
  fetchOnboardingStatus: vi.fn(() => Promise.resolve({ completed: true, dismissedHints: [] })),
}));

describe('LightingPage canvas header', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('nexus_settings', JSON.stringify({ general: { lightingDashboardMode: 'advanced', coolingDashboardMode: 'advanced' } }));
  });

  it('keeps its title, scope chip on the left, then the view switch right before the Effect editor button', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(fetchPins).toHaveBeenCalled());
    const group = await screen.findByRole('radiogroup', { name: 'lighting.scene.viewSwitch' });
    const header = group.closest('[class*="paneHeader"]') as HTMLElement;
    expect(header).toBeTruthy();
    const order = [...header.querySelectorAll('[class*="paneTitle"], [role="radiogroup"], button[aria-label="lighting.effectDock.expand"]')].map(el => (el.matches('[role="radiogroup"]') ? 'switch' : el.matches('button') ? 'dock' : 'title'));
    expect(order).toEqual(['title', 'switch', 'dock']);
    expect(header.firstElementChild?.textContent).toBe('lighting.pane.effects');
    expect(group.nextElementSibling?.getAttribute('aria-label')).toBe('lighting.effectDock.expand');
    expect(group.parentElement?.lastElementChild).toBe(group.nextElementSibling);
    expect(container.querySelector('[role="radiogroup"][aria-label="lighting.scene.viewSwitch"]')).toBe(group);
  });

  it('labels the segments Layout and Desk with 2D and 3D pills and keeps the title when switched', async () => {
    renderPage();
    const group = await screen.findByRole('radiogroup', { name: 'lighting.scene.viewSwitch' });
    const radios = within(group).getAllByRole('radio');
    expect(radios[0].textContent).toContain('lighting.scene.view.2d');
    expect(radios[0].textContent).toContain('lighting.view.layout');
    expect(radios[1].textContent).toContain('lighting.scene.view.3d');
    expect(radios[1].textContent).toContain('lighting.view.desk');
    expect(radios[1].textContent).not.toMatch(/[[\]]/);
    const title = () => screen.getAllByText('lighting.pane.effects')[0].textContent;
    const before = title();
    fireEvent.click(radios[1]);
    expect(title()).toBe(before);
  });

  it('opens on its own stored 3D view with no 2D canvas first, and not on the Cooling choice', async () => {
    localStorage.setItem('nexus_settings', JSON.stringify({ general: { lightingDashboardMode: 'advanced', coolingDashboardMode: 'advanced', lightingView3d: true, coolingView3d: false } }));
    renderPage();
    const group = await screen.findByRole('radiogroup', { name: 'lighting.scene.viewSwitch' });
    expect(within(group).getAllByRole('radio')[1].getAttribute('aria-checked')).toBe('true');
    expect(screen.queryByTestId('preview')).toBeNull();
  });

  it('opens on 2D when only Cooling has a stored 3D view', async () => {
    localStorage.setItem('nexus_settings', JSON.stringify({ general: { lightingDashboardMode: 'advanced', coolingDashboardMode: 'advanced', lightingView3d: false, coolingView3d: true } }));
    renderPage();
    const group = await screen.findByRole('radiogroup', { name: 'lighting.scene.viewSwitch' });
    expect(within(group).getAllByRole('radio')[0].getAttribute('aria-checked')).toBe('true');
  });
});
