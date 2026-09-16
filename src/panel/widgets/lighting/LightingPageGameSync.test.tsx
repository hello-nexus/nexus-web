import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchGameSyncState, setGameSyncVendorOverride } from '../../../api/lighting';
import { UiSettingsProvider } from '../../../hooks/useUiSettings';
import { LightingPage } from './LightingPage';

const gameSyncState = vi.hoisted(() => ({
  active: true,
  providerInstalled: false,
  synapseConflict: false,
  vendorOverride: false,
  devices: [] as never[],
  lastFrameAt: null as number | null,
  activeApp: null as string | null,
}));

// Stable setters: the page's profile-load effect lists them as deps, so a
// fresh vi.fn() per render would re-run it every render.
const lightingSync = vi.hoisted(() => ({
  mode: 'gamesync',
  setMode: vi.fn(),
  rawSync: 'gamesync',
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
  useLightingFrames: () => ({ canvasPixels: null, canvasW: 160, canvasH: 90 }),
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
vi.mock('./page/DevicePanel', () => ({ DevicePanel: () => null }));
vi.mock('./page/LedMapEditor', () => ({ LedMapEditor: () => null }));
vi.mock('./page/RightPaneTabs', () => ({ RightPaneTabs: () => null }));
vi.mock('./page/EffectTab', () => ({ EffectTab: () => null }));
vi.mock('./page/GameSyncLeftPane', () => ({ GameSyncLeftPane: () => null }));
vi.mock('../../../components/common/ViewHeader/ViewHeader', () => ({ ViewHeader: () => null }));
vi.mock('../../../components/views/ServiceRequired', () => ({ ServiceRequired: () => null }));
vi.mock('../../../components/views/PageSkeleton/PageSkeleton', () => ({ LightingSkeleton: () => null }));
vi.mock('../../../components/common/DeviceCanvas/DeviceCanvas', () => ({ DeviceCanvas: () => null }));

vi.mock('../../../api/lighting', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../api/lighting')>();
  return {
    ...actual,
    fetchCurrentSync: vi.fn(() => Promise.resolve({ sync: 'gamesync' })),
    fetchAnimateSettings: vi.fn(() => Promise.resolve({ effect: 'fire', states: {}, templates: {} })),
    fetchStaticSettings: vi.fn(() => Promise.resolve({ effect: 'checker', states: {} })),
    fetchAnimateDefaults: vi.fn(() => Promise.resolve(null)),
    cachedAnimateDefaults: vi.fn(() => null),
    fetchMusicReactive: vi.fn(() => Promise.resolve({ enabled: false })),
    fetchScreenEffect: vi.fn(() => Promise.resolve({ hue: 0, colorize: 0, saturation: 1, contrast: 1 })),
    fetchMediaEffect: vi.fn(() => Promise.resolve({ hue: 0, colorize: 0, saturation: 1, contrast: 1 })),
    fetchLightingDevices: vi.fn(() => Promise.resolve({ isInit: true, devices: [] })),
    fetchLedMap: vi.fn(() => Promise.resolve(null)),
    fetchAvailableMappings: vi.fn(() => Promise.resolve(null)),
    fetchLayoutPresets: vi.fn(() => Promise.resolve(null)),
    fetchGameSyncState: vi.fn(() => Promise.resolve({ ...gameSyncState })),
    fetchGameSyncGames: vi.fn(() => Promise.resolve({ scanning: false, scannedAt: null, games: [] })),
    startGameSync: vi.fn(() => Promise.resolve(null)),
    setGameSyncVendorOverride: vi.fn((enabled: boolean) => Promise.resolve({
      ...gameSyncState, synapseConflict: !enabled, vendorOverride: enabled,
    })),
    stopLighting: vi.fn(() => Promise.resolve(null)),
  };
});

const serviceState = { cooling: null, lighting: null, panel: null } as never;

// No locale bundle is loaded under test, so t() renders the key itself.
const IDLE = 'lighting.gameSync.signal.idle';
const VENDOR_OFF = 'lighting.gameSync.vendor.off';
const VENDOR_ON = 'lighting.gameSync.vendor.on';
const GUIDE = 'lighting.gameSync.guideLink';

function renderPage() {
  localStorage.setItem('nexus_settings', JSON.stringify({ general: { lightingDashboardMode: 'advanced', coolingDashboardMode: 'advanced' } }));
  return render(
    <UiSettingsProvider>
      <LightingPage serviceOnline serviceState={serviceState} activeProfileId="p1" platform="windows" />
    </UiSettingsProvider>,
  );
}

describe('LightingPage in Game Sync mode', () => {
  beforeEach(() => {
    gameSyncState.synapseConflict = false;
    gameSyncState.vendorOverride = false;
    vi.mocked(fetchGameSyncState).mockClear();
    vi.mocked(setGameSyncVendorOverride).mockClear();
  });

  it('offers the vendor switch, off, when a vendor SDK holds a shim slot', async () => {
    gameSyncState.synapseConflict = true;
    renderPage();

    await waitFor(() => {
      expect(screen.getByText(IDLE)).toBeInTheDocument();
    });
    // Razer Synapse's own Chroma DLL is left in place, so a Chroma game lights
    // Synapse, not Nexus; the frame used to sit on "Waiting" with no hint why.
    await waitFor(() => {
      expect(screen.getByText(VENDOR_OFF)).toBeInTheDocument();
    });
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
    // The switch takes the guide link's room.
    expect(screen.queryByText(GUIDE)).toBeNull();
  });

  it('flips to on from the service reply when the switch is used', async () => {
    gameSyncState.synapseConflict = true;
    renderPage();

    const toggle = await screen.findByRole('switch');
    fireEvent.click(toggle);

    expect(vi.mocked(setGameSyncVendorOverride)).toHaveBeenCalledWith(true);
    await waitFor(() => {
      expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
    });
    expect(screen.getByText(VENDOR_ON)).toBeInTheDocument();
  });

  it('reads as off again when a vendor repair put its DLL back over the override', async () => {
    gameSyncState.synapseConflict = true;
    gameSyncState.vendorOverride = true;
    renderPage();

    const toggle = await screen.findByRole('switch');
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText(VENDOR_OFF)).toBeInTheDocument();
  });

  it('keeps the idle frame plain when every shim slot is ours', async () => {
    renderPage();

    // The idle label is up before the first poll answers, so wait for the
    // state fetch, await its own promise, then flush the continuation that
    // applies it before asserting the switch stayed away.
    await waitFor(() => {
      expect(vi.mocked(fetchGameSyncState)).toHaveBeenCalled();
    });
    await vi.mocked(fetchGameSyncState).mock.results[0].value;
    await act(async () => {});
    expect(screen.getByText(IDLE)).toBeInTheDocument();
    expect(screen.queryByRole('switch')).toBeNull();
    expect(screen.getByText(GUIDE)).toBeInTheDocument();
  });
});
