import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { saveAnimateTemplates, startAnimate } from '../../../api/lighting';
import { UiSettingsProvider } from '../../../hooks/useUiSettings';
import { LightingPage } from './LightingPage';


// Stable setters: the page's profile-load effect lists them as deps.
const lightingSync = vi.hoisted(() => ({
  mode: 'animate',
  setMode: vi.fn(),
  rawSync: 'plasma',
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

vi.mock('./page/AnimateGrid', () => ({
  AnimateGrid: ({ onSelect }: { onSelect: (key: string) => void }) => (
    <button type="button" onClick={() => onSelect('custom:fx1')}>pick</button>
  ),
}));
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
vi.mock('./page/EffectTab', () => ({
  EffectTab: ({ state, canReset, onAnimateReset, onAnimateChange }: {
    state: { hue: number; colorize: number } | null; canReset: boolean; onAnimateReset: () => void; onAnimateChange: (p: object, c?: boolean) => void;
  }) => (
    <div data-testid="tab" data-hue={state?.hue} data-colorize={state?.colorize} data-canreset={String(canReset)}>
      <button type="button" onClick={onAnimateReset}>reset</button>
      <button type="button" onClick={() => onAnimateChange({ hue: 0.9, colorize: 0.1 }, true)}>edit</button>
    </div>
  ),
}));
vi.mock('../../../components/common/ViewHeader/ViewHeader', () => ({ ViewHeader: () => null }));
vi.mock('../../../components/views/ServiceRequired', () => ({ ServiceRequired: () => null }));
vi.mock('../../../components/common/DeviceCanvas/DeviceCanvas', () => ({ DeviceCanvas: () => null }));


const entry = {
  id: 'fx1', name: 'Wheel', updatedAt: 1, audio: false,
  recipe: JSON.stringify({ v: 1, hue: 0.31, colorize: 0.38, blocks: [{ uid: 'a1', type: 'fillbar' }, { uid: 'c1', type: 'wheelcolor' }] }),
};

vi.mock('../../../api/customEffects', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../api/customEffects')>()),
  useCustomEffects: () => [entry],
  customEffectsLoaded: () => true,
  refreshCustomEffects: async () => {},
}));

vi.mock('../../../api/lighting', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../api/lighting')>();
  return {
    ...actual,
    fetchCurrentSync: vi.fn(() => Promise.resolve({ sync: 'plasma' })),
    fetchAnimateSettings: vi.fn(() => Promise.resolve({ effect: 'plasma', states: {}, templates: {} })),
    fetchStaticSettings: vi.fn(() => Promise.resolve({ effect: 'checker', states: {} })),
    fetchAnimateDefaults: vi.fn(() => Promise.resolve({ plasma: { selected: 0, slots: [{ speed: 50, intensity: 1, hue: 0, colorize: 0, saturation: 1, contrast: 1, params: {} }] } })),
    cachedAnimateDefaults: vi.fn(() => ({})),
    startAnimate: vi.fn(() => Promise.resolve(null)),
    saveAnimateTemplates: vi.fn(() => Promise.resolve(null)),
    fetchMusicReactive: vi.fn(() => Promise.resolve({ enabled: false })),
    fetchScreenEffect: vi.fn(() => Promise.resolve({ hue: 0, colorize: 0, saturation: 1, contrast: 1 })),
    fetchMediaEffect: vi.fn(() => Promise.resolve({ hue: 0, colorize: 0, saturation: 1, contrast: 1 })),
    fetchLightingDevices: vi.fn(() => Promise.resolve({ isInit: true, devices: [] })),
    fetchLedMap: vi.fn(() => Promise.resolve(null)),
    fetchAvailableMappings: vi.fn(() => Promise.resolve(null)),
    fetchLayoutPresets: vi.fn(() => Promise.resolve(null)),
  };
});

const serviceState = { cooling: null, lighting: null, panel: null } as never;

function renderPage() {
  localStorage.setItem('nexus.lighting.effectDockCollapsed', 'false');
  localStorage.setItem('nexus_settings', JSON.stringify({ general: { lightingDashboardMode: 'advanced', coolingDashboardMode: 'advanced' } }));
  return render(
    <UiSettingsProvider>
      <LightingPage serviceOnline serviceState={serviceState} activeProfileId="p1" platform="windows" />
    </UiSettingsProvider>,
  );
}

describe('LightingPage with a wheel-colored custom effect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('starts a first pick on the authored range and saves it, so the LEDs and the ring agree', async () => {
    renderPage();
    fireEvent.click(await screen.findByText('pick'));
    await waitFor(() => {
      expect(vi.mocked(startAnimate)).toHaveBeenCalledWith('custom:fx1', 50, 1, 0.31, 0.38, 1, 1, {}, true, undefined);
    });
    await waitFor(() => {
      const saved = vi.mocked(saveAnimateTemplates).mock.calls.at(-1)?.[0]['custom:fx1'];
      expect(saved?.slots[0]).toMatchObject({ hue: 0.31, colorize: 0.38 });
    });
    const tab = await screen.findByTestId('tab');
    expect(tab.dataset.hue).toBe('0.31');
    expect(tab.dataset.canreset).toBe('false');
  });

  it('resets an edited slot to the authored range, not the neutral wheel', async () => {
    renderPage();
    fireEvent.click(await screen.findByText('pick'));
    const tab = await screen.findByTestId('tab');
    await waitFor(() => expect(tab.dataset.hue).toBe('0.31'));
    fireEvent.click(screen.getByText('edit'));
    await waitFor(() => expect(tab.dataset.canreset).toBe('true'));
    vi.mocked(startAnimate).mockClear();
    fireEvent.click(screen.getByText('reset'));
    await waitFor(() => {
      expect(vi.mocked(startAnimate)).toHaveBeenCalledWith('custom:fx1', 50, 1, 0.31, 0.38, 1, 1, {}, true, undefined);
    });
    await waitFor(() => expect(tab.dataset.canreset).toBe('false'));
  });
});
