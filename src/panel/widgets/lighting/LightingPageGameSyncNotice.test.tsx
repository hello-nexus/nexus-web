import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchCurrentSync, startAnimate, startStatic, stopLighting } from '../../../api/lighting';
import { dismissOnboardingHint, fetchOnboardingStatus } from '../../../api/onboarding';
import { resetOnboardingHintSession } from '../../../hooks/useOnboardingHint';
import { UiSettingsProvider } from '../../../hooks/useUiSettings';
import { LightingPage } from './LightingPage';

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
vi.mock('../../../components/views/ServiceRequired', () => ({ ServiceRequired: () => null }));
vi.mock('../../../components/common/DeviceCanvas/DeviceCanvas', () => ({ DeviceCanvas: () => <div /> }));
vi.mock('./page/LedMapEditor', () => ({ LedMapEditor: () => null }));

vi.mock('../../../api/onboarding', () => ({
  fetchOnboardingStatus: vi.fn(),
  dismissOnboardingHint: vi.fn(),
}));

vi.mock('../../../api/lighting', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../api/lighting')>();
  return {
    ...actual,
    fetchCurrentSync: vi.fn(),
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
    startAnimate: vi.fn(() => Promise.resolve(null)),
    startStatic: vi.fn(() => Promise.resolve(null)),
    startScreenMirror: vi.fn(() => Promise.resolve(null)),
    stopLighting: vi.fn(() => Promise.resolve(null)),
    fetchPins: vi.fn(() => Promise.resolve({})),
  };
});

const serviceState = { cooling: null, lighting: null, panel: null } as never;

const renderPage = (platform: string) => render(
  <UiSettingsProvider>
    <LightingPage serviceOnline serviceState={serviceState} activeProfileId="p1" platform={platform} />
  </UiSettingsProvider>,
);

const gameSyncTab = () => screen.queryByRole('tab', { name: 'lighting.mode.gamesync' });

describe('Game Sync removal notice tab', () => {
  beforeEach(() => {
    localStorage.setItem('nexus_settings', JSON.stringify({ general: { lightingDashboardMode: 'advanced', coolingDashboardMode: 'advanced' } }));
    vi.mocked(fetchCurrentSync).mockReset();
    resetOnboardingHintSession();
    vi.mocked(fetchOnboardingStatus).mockReset().mockResolvedValue({ completed: true, dismissedHints: [] });
    vi.mocked(dismissOnboardingHint).mockReset().mockResolvedValue({ status: 200, body: { completed: true, dismissedHints: ['game-sync-removed-notice'] } });
    vi.mocked(startAnimate).mockClear();
    vi.mocked(startStatic).mockClear();
    vi.mocked(stopLighting).mockClear();
  });

  it('renders a disabled tab whose (i) shows the notice on hover and on tap', async () => {
    vi.mocked(fetchCurrentSync).mockResolvedValue({ sync: 'none', paused: false, gameSyncRemovedNotice: true });
    renderPage('windows');

    await waitFor(() => expect(gameSyncTab()).toBeTruthy());
    const tab = gameSyncTab()!;
    expect(tab).toBeDisabled();
    expect(tab).toHaveAttribute('aria-selected', 'false');

    const info = screen.getByRole('button', { name: 'infoTooltip.ariaLabel' });
    fireEvent.pointerEnter(info, { pointerType: 'mouse' });
    expect(await screen.findByText('lighting.gameSync.removedNotice', {}, { timeout: 3000 })).toBeInTheDocument();
    fireEvent.pointerLeave(info, { pointerType: 'mouse' });
    await waitFor(() => expect(screen.queryByText('lighting.gameSync.removedNotice')).toBeNull());

    fireEvent.click(info);
    expect(screen.getByText('lighting.gameSync.removedNotice')).toBeInTheDocument();
  });

  it('does not switch tabs or start lighting when clicked', async () => {
    vi.mocked(fetchCurrentSync).mockResolvedValue({ sync: 'none', paused: false, gameSyncRemovedNotice: true });
    renderPage('windows');
    await waitFor(() => expect(gameSyncTab()).toBeTruthy());

    fireEvent.click(gameSyncTab()!);

    expect(gameSyncTab()).toHaveAttribute('aria-selected', 'false');
    expect(startAnimate).not.toHaveBeenCalled();
    expect(startStatic).not.toHaveBeenCalled();
    expect(stopLighting).not.toHaveBeenCalled();
  });

  it('is absent when the service already lists the hint as dismissed', async () => {
    vi.mocked(fetchCurrentSync).mockResolvedValue({ sync: 'none', paused: false, gameSyncRemovedNotice: true });
    vi.mocked(fetchOnboardingStatus).mockResolvedValue({ completed: true, dismissedHints: ['game-sync-removed-notice'] });
    renderPage('windows');

    await waitFor(() => expect(fetchOnboardingStatus).toHaveBeenCalled());
    await screen.findAllByRole('tab');
    expect(gameSyncTab()).toBeNull();
  });

  it('does not ask the service about the notice hint when the notice cannot show', async () => {
    vi.mocked(fetchCurrentSync).mockResolvedValue({ sync: 'none', paused: false });
    renderPage('windows');

    await screen.findAllByRole('tab');
    // The first-pin hint asks once; a second ask would be this notice's own.
    await waitFor(() => expect(fetchOnboardingStatus).toHaveBeenCalledTimes(1));
  });

  it('Remove tab dismisses the hint on the service and hides the tab', async () => {
    vi.mocked(fetchCurrentSync).mockResolvedValue({ sync: 'none', paused: false, gameSyncRemovedNotice: true });
    renderPage('windows');
    await waitFor(() => expect(gameSyncTab()).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'infoTooltip.ariaLabel' }));
    fireEvent.click(await screen.findByRole('button', { name: 'lighting.gameSync.removeTab' }));

    expect(dismissOnboardingHint).toHaveBeenCalledWith('game-sync-removed-notice');
    await waitFor(() => expect(gameSyncTab()).toBeNull());
  });

  it.each([
    ['the flag is false', 'windows', { gameSyncRemovedNotice: false }],
    ['the flag is absent', 'windows', {}],
    ['the platform is not Windows', 'macos', { gameSyncRemovedNotice: true }],
  ])('is absent when %s', async (_name, platform, extra) => {
    vi.mocked(fetchCurrentSync).mockResolvedValue({ sync: 'none', paused: false, ...extra });
    renderPage(platform);

    await waitFor(() => expect(fetchCurrentSync).toHaveBeenCalled());
    await screen.findAllByRole('tab');
    expect(gameSyncTab()).toBeNull();
  });
});
