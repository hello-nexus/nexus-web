import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UiSettingsProvider } from '../../../hooks/useUiSettings';
import { SIMPLE_MODE_EFFECTS } from '../../../types/lighting';
import * as lightingApi from '../../../api/lighting';
import { LightingPage } from './LightingPage';

// Rendered outside I18nProvider, so t() falls back to raw keys.

vi.mock('../../../hooks/useLightingSync', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../hooks/useLightingSync')>()),
  useLightingSync: () => ({
    mode: 'none',
    setMode: vi.fn(),
    rawSync: 'none',
    setRawSync: vi.fn(),
    synced: true,
    paused: false,
  }),
}));

vi.mock('../../../hooks/useMultiplexSocket', () => ({
  useTopicCallback: vi.fn(),
  useTopic: vi.fn(() => null),
}));

vi.mock('../../../hooks/useLightingFrames', () => ({
  useLightingFrames: () => ({ canvasPixels: null, canvasW: 160, canvasH: 90 }),
}));
vi.mock('../../../hooks/useUsbDevices', () => ({ useUsbDevices: () => ({ devices: [] }) }));
vi.mock('../../../hooks/useAudioState', () => ({ useAudioState: () => ({ current: null }) }));
vi.mock('../../../lib/controlSync', () => ({
  publishControlSync: vi.fn(),
  subscribeControlSync: vi.fn(() => () => {}),
}));

vi.mock('./page/AnimateGrid', () => ({
  AnimateGrid: ({ onSelect, effects, simpleBrowse }: {
    onSelect: (key: string) => void;
    effects?: { key: string }[];
    simpleBrowse?: boolean;
  }) => (
    <div
      data-testid="animate-grid"
      data-simple-browse={simpleBrowse ? 'true' : 'false'}
      data-effect-count={effects?.length ?? 0}
    >
      <button type="button" onClick={() => onSelect('simplered')}>pick-fill</button>
      <button type="button" onClick={() => onSelect('rainbow')}>pick-animation</button>
    </div>
  ),
}));
vi.mock('./page/FullscreenShader', () => ({ FullscreenShader: () => null }));
vi.mock('./page/ModeControls', () => ({ ModeControls: () => null }));
vi.mock('./page/DevicePanel', () => ({ DevicePanel: () => null }));
vi.mock('./page/LedMapEditor', () => ({ LedMapEditor: () => null }));
// Advanced-branch marker: the simple page never mounts the right-pane tabs.
vi.mock('./page/RightPaneTabs', () => ({ RightPaneTabs: () => <div data-testid="right-pane-tabs" /> }));
vi.mock('./page/EffectTab', () => ({ EffectTab: () => null }));
vi.mock('../../../components/common/ViewHeader/ViewHeader', () => ({ ViewHeader: () => null }));
vi.mock('../../../components/views/ServiceRequired', () => ({ ServiceRequired: () => null }));
vi.mock('../../../components/views/PageSkeleton/PageSkeleton', () => ({ LightingSkeleton: () => null }));
vi.mock('../../../components/common/DeviceCanvas/DeviceCanvas', () => ({ DeviceCanvas: () => null }));

vi.mock('../../../api/lighting', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../api/lighting')>();
  return {
    ...actual,
    fetchCurrentSync: vi.fn(() => Promise.resolve({ sync: 'none' })),
    fetchAnimateSettings: vi.fn(() => Promise.resolve({ effect: 'rainbow', states: {}, templates: {} })),
    fetchStaticSettings: vi.fn(() => Promise.resolve({ effect: 'simplered', states: {} })),
    fetchAnimateDefaults: vi.fn(() => Promise.resolve(null)),
    cachedAnimateDefaults: vi.fn(() => null),
    fetchMusicReactive: vi.fn(() => Promise.resolve({ enabled: false })),
    fetchScreenEffect: vi.fn(() => Promise.resolve({ hue: 0, colorize: 0, saturation: 1, contrast: 1 })),
    fetchMediaEffect: vi.fn(() => Promise.resolve({ hue: 0, colorize: 0, saturation: 1, contrast: 1 })),
    fetchLightingDevices: vi.fn(() => Promise.resolve({ isInit: true, devices: [] })),
    fetchLedMap: vi.fn(() => Promise.resolve(null)),
    fetchAvailableMappings: vi.fn(() => Promise.resolve(null)),
    fetchLayoutPresets: vi.fn(() => Promise.resolve(null)),
    saveAnimateTemplates: vi.fn(() => Promise.resolve(null)),
    startAnimate: vi.fn(() => Promise.resolve(null)),
    startStatic: vi.fn(() => Promise.resolve(null)),
    stopLighting: vi.fn(() => Promise.resolve(null)),
    setMusicReactive: vi.fn(() => Promise.resolve(null)),
  };
});

const serviceState = { cooling: null, lighting: null, panel: null } as never;

function renderPage() {
  return render(
    <UiSettingsProvider>
      <LightingPage serviceOnline serviceState={serviceState} activeProfileId="p1" />
    </UiSettingsProvider>,
  );
}

describe('LightingPage simple mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Fresh install: no stored settings, dashboardMode defaults to 'simple'.
    localStorage.clear();
  });

  it('defaults to the simple browse with the simple-mode pool and no advanced chrome', () => {
    renderPage();
    const grid = screen.getByTestId('animate-grid');
    expect(grid.getAttribute('data-simple-browse')).toBe('true');
    expect(grid.getAttribute('data-effect-count')).toBe(String(SIMPLE_MODE_EFFECTS.length));
    expect(screen.queryByTestId('right-pane-tabs')).toBeNull();
    expect(screen.getByRole('button', { name: /lighting\.simple\.advancedCta/ })).toBeTruthy();
  });

  it('applies a fill as static and an animation as animate', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'pick-fill' }));
    await waitFor(() => {
      expect(vi.mocked(lightingApi.startStatic).mock.calls.some(c => c[0] === 'simplered')).toBe(true);
    });
    fireEvent.click(screen.getByRole('button', { name: 'pick-animation' }));
    await waitFor(() => {
      expect(vi.mocked(lightingApi.startAnimate).mock.calls.some(c => c[0] === 'rainbow')).toBe(true);
    });
  });

  it('switches to the advanced page from the CTA', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /lighting\.simple\.advancedCta/ }));
    await waitFor(() => {
      expect(screen.getByTestId('right-pane-tabs')).toBeTruthy();
    });
    expect(screen.queryByRole('button', { name: /lighting\.simple\.advancedCta/ })).toBeNull();
  });
});
