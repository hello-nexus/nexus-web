import { useState } from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FramesPage } from './FramesPage';
import type { FpsGameSummary, FpsSessionsResponse } from '../../../api/fps';
import type { UseFpsGamesResult } from '../../../hooks/useFpsGames';
import type { SystemSpecs } from '../../../hooks/useSystemSpecs';

const getFpsTrackingStatusMock = vi.fn();
const fetchFpsGameSessionsMock = vi.fn();
const deleteFpsSessionMock = vi.fn();
const deleteFpsGameMock = vi.fn();
vi.mock('../../../api/fps', () => ({
  getFpsTrackingStatus: () => getFpsTrackingStatusMock(),
  fetchFpsGameSessions: (gameKey: string, limit?: number) => fetchFpsGameSessionsMock(gameKey, limit),
  deleteFpsSession: (id: string) => deleteFpsSessionMock(id),
  deleteFpsGame: (gameKey: string) => deleteFpsGameMock(gameKey),
}));

const fetchMonitoringHistoryMock = vi.fn();
vi.mock('../../../api/monitoringHistory', () => ({
  fetchMonitoringHistory: (query: unknown) => fetchMonitoringHistoryMock(query),
}));

const refetchGamesMock = vi.fn();
let fpsGamesResult: UseFpsGamesResult = { supported: true, gamesByKey: new Map(), refetch: refetchGamesMock };
vi.mock('../../../hooks/useFpsGames', () => ({
  useFpsGames: () => fpsGamesResult,
}));

let systemSpecs: SystemSpecs | null = null;
vi.mock('../../../hooks/useSystemSpecs', () => ({
  useSystemSpecs: () => ({ specs: systemSpecs }),
}));

vi.mock('../../../hooks/useUiSettings', () => ({
  useUnitPrefs: () => ({ monitoringTempUnit: 'c', timeFormat: 'system', numberFormat: 'system' }),
}));

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, string | number>) => (
      vars ? `${key}(${Object.entries(vars).map(([k, v]) => `${k}=${v}`).join(',')})` : key
    ),
  }),
}));

function game(overrides: Partial<FpsGameSummary> = {}): FpsGameSummary {
  return {
    gameKey: 'steam:730', name: 'Counter-Strike 2', store: 'steam', steamAppId: 730,
    sessions: 5, focusedSec: 18_000, avgFps: 132, p1Fps: 90, p99Fps: 200, minFps: 40, maxFps: 240,
    lastPlayedUtcMs: 2_000,
    ...overrides,
  };
}

function gamesByKey(...entries: FpsGameSummary[]): UseFpsGamesResult['gamesByKey'] {
  return new Map(entries.map(g => [g.gameKey, g]));
}

function session(overrides: Partial<FpsSessionsResponse['sessions'][number]> = {}) {
  return {
    id: 's1', startedUtcMs: Date.now() - 1000, endedUtcMs: Date.now(), focusedSec: 600, validSec: 600,
    avgFps: 132, p1Fps: 90, p99Fps: 200, minFps: 40, maxFps: 240,
    dispW: 2560, dispH: 1440, refreshHz: 144, fullscreen: true, capped: false, capValue: 0,
    ...overrides,
  };
}

const flush = () => act(async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
});

beforeEach(() => {
  fpsGamesResult = { supported: true, gamesByKey: new Map(), refetch: refetchGamesMock };
  systemSpecs = null;
  getFpsTrackingStatusMock.mockReset().mockResolvedValue({ enabled: true });
  fetchFpsGameSessionsMock.mockReset().mockResolvedValue({ sessions: [] });
  deleteFpsSessionMock.mockReset().mockResolvedValue({ deleted: 1 });
  deleteFpsGameMock.mockReset().mockResolvedValue({ deleted: 1 });
  refetchGamesMock.mockReset();
  fetchMonitoringHistoryMock.mockReset().mockResolvedValue({ data: { supported: true, retentionDays: 7, stepSeconds: 1, series: [] }, mocked: false, unsupported: false });
});

afterEach(() => {
  vi.clearAllMocks();
});

// A thin stateful wrapper: Dashboard.tsx owns `tab`/`onTabChange` the same
// way (see its 'frames' switch case), so a click that calls onTabChange
// must actually re-render FramesPage with the new tab for the test to
// observe real navigation (a no-op onTabChange mock wouldn't).
function Harness({ initialTab }: { initialTab: string | null }) {
  const [tab, setTab] = useState(initialTab);
  return <FramesPage tab={tab} onTabChange={setTab} />;
}

function renderPage(tab: string | null = null) {
  return render(<Harness initialTab={tab} />);
}

describe('FramesPage - History tab states', () => {
  it('shows the unsupported message when the platform has no fps capture', async () => {
    fpsGamesResult = { supported: false, gamesByKey: new Map(), refetch: refetchGamesMock };
    renderPage();
    await flush();
    expect(await screen.findByText('frames.unsupported')).toBeInTheDocument();
  });

  it('shows the tracking-off message when the toggle is off', async () => {
    getFpsTrackingStatusMock.mockResolvedValue({ enabled: false });
    renderPage();
    expect(await screen.findByText('frames.trackingOff.title')).toBeInTheDocument();
    expect(screen.getByText('frames.trackingOff.hint')).toBeInTheDocument();
  });

  it('shows a dedicated blank state with no search box or counter when there are no recordings at all', async () => {
    renderPage();
    await flush();

    expect(await screen.findByText('frames.empty.title')).toBeInTheDocument();
    expect(screen.getByText('frames.empty.hint')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('steam.library.searchPlaceholder')).not.toBeInTheDocument();
    expect(screen.queryByText(/steam\.library\.count/)).not.toBeInTheDocument();
  });

  it('lists every game as a card and filters by search', async () => {
    fpsGamesResult = {
      supported: true,
      gamesByKey: gamesByKey(game(), game({ gameKey: 'steam:440', name: 'Team Fortress 2', steamAppId: 440 })),
      refetch: refetchGamesMock,
    };
    renderPage();
    await flush();

    expect(await screen.findByText('Counter-Strike 2')).toBeInTheDocument();
    expect(screen.getByText('Team Fortress 2')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('steam.library.searchPlaceholder'), { target: { value: 'team' } });
    expect(screen.queryByText('Counter-Strike 2')).not.toBeInTheDocument();
    expect(screen.getByText('Team Fortress 2')).toBeInTheDocument();
  });

  it('shows a Steam capsule image for a steam game and a store-badge placeholder for a non-steam one', async () => {
    fpsGamesResult = {
      supported: true,
      gamesByKey: gamesByKey(game(), game({ gameKey: 'epic:foo', name: 'Some Epic Game', store: 'epic', steamAppId: null })),
      refetch: refetchGamesMock,
    };
    const { container } = renderPage();
    await flush();
    await screen.findByText('Counter-Strike 2');

    expect(container.querySelector('img[src*="steamstatic"]')).toBeInTheDocument();
    expect(screen.getAllByText('epic')).toHaveLength(2);
  });
});

describe('FramesPage - game detail', () => {
  beforeEach(() => {
    fpsGamesResult = { supported: true, gamesByKey: gamesByKey(game()), refetch: refetchGamesMock };
  });

  it('opens the detail view on card click and fetches its sessions', async () => {
    fetchFpsGameSessionsMock.mockResolvedValue({ sessions: [session()] });
    renderPage();
    await flush();

    fireEvent.click(await screen.findByText('Counter-Strike 2'));
    await flush();

    expect(fetchFpsGameSessionsMock).toHaveBeenCalledWith('steam:730', 50);
    expect(screen.getByText('132')).toBeInTheDocument();
    expect(screen.getByText('90')).toBeInTheDocument();
    expect(screen.getByText('200')).toBeInTheDocument();
  });

  it('opens the detail view directly when deep-linked via a gameKey tab', async () => {
    fetchFpsGameSessionsMock.mockResolvedValue({ sessions: [] });
    renderPage('steam:730');
    await flush();

    expect(await screen.findByText('Counter-Strike 2')).toBeInTheDocument();
    expect(fetchFpsGameSessionsMock).toHaveBeenCalledWith('steam:730', 50);
  });

  it('shows a retention note instead of fetching history for a session older than 7 days', async () => {
    const old = session({ startedUtcMs: Date.now() - 10 * 86_400_000, endedUtcMs: Date.now() - 9 * 86_400_000 });
    fetchFpsGameSessionsMock.mockResolvedValue({ sessions: [old] });
    renderPage('steam:730');
    await flush();

    expect(await screen.findByText('frames.timeline.tooOld')).toBeInTheDocument();
    expect(fetchMonitoringHistoryMock).not.toHaveBeenCalled();
  });

  it('fetches the session range and renders no-data when history comes back empty', async () => {
    const recent = session();
    fetchFpsGameSessionsMock.mockResolvedValue({ sessions: [recent] });
    renderPage('steam:730');
    await flush();

    expect(fetchMonitoringHistoryMock).toHaveBeenCalledWith({ from: recent.startedUtcMs, to: recent.endedUtcMs, series: 'fps' });
    expect(await screen.findByText('frames.timeline.noData')).toBeInTheDocument();
  });
});

describe('FramesPage - deleting a single session', () => {
  beforeEach(() => {
    fpsGamesResult = { supported: true, gamesByKey: gamesByKey(game()), refetch: refetchGamesMock };
  });

  it('does nothing when the confirm dialog is cancelled', async () => {
    fetchFpsGameSessionsMock.mockResolvedValue({ sessions: [session({ id: 's1' }), session({ id: 's2', startedUtcMs: Date.now() - 5000, endedUtcMs: Date.now() - 4000 })] });
    renderPage('steam:730');
    await flush();

    fireEvent.click(screen.getAllByRole('button', { name: 'frames.session.deleteAria' })[0]);
    const dialog = await screen.findByRole('alertdialog', { name: 'frames.session.deleteConfirmTitle' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'confirm.cancel' }));

    expect(deleteFpsSessionMock).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('deletes the session, refetches games, and stays in the detail view when other sessions remain', async () => {
    fetchFpsGameSessionsMock.mockResolvedValue({
      sessions: [session({ id: 's1' }), session({ id: 's2', startedUtcMs: Date.now() - 5000, endedUtcMs: Date.now() - 4000 })],
    });
    renderPage('steam:730');
    await flush();

    fireEvent.click(screen.getAllByRole('button', { name: 'frames.session.deleteAria' })[0]);
    const dialog = await screen.findByRole('alertdialog', { name: 'frames.session.deleteConfirmTitle' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'frames.session.deleteAria' }));
    await flush();

    expect(deleteFpsSessionMock).toHaveBeenCalledWith('s1');
    expect(refetchGamesMock).toHaveBeenCalled();
    expect(screen.getByText('Counter-Strike 2')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'frames.session.deleteAria' })).toHaveLength(1);
  });

  it('returns to History once the last session for a game is deleted', async () => {
    fetchFpsGameSessionsMock.mockResolvedValue({ sessions: [session({ id: 's1' })] });
    renderPage('steam:730');
    await flush();

    fireEvent.click(screen.getByRole('button', { name: 'frames.session.deleteAria' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'frames.session.deleteConfirmTitle' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'frames.session.deleteAria' }));
    await flush();

    expect(deleteFpsSessionMock).toHaveBeenCalledWith('s1');
    expect(screen.queryByText('steam.action.back')).not.toBeInTheDocument();
    expect(screen.getByText('Counter-Strike 2')).toBeInTheDocument();
  });
});

describe('FramesPage - deleting all recordings for a game', () => {
  beforeEach(() => {
    fpsGamesResult = { supported: true, gamesByKey: gamesByKey(game()), refetch: refetchGamesMock };
    fetchFpsGameSessionsMock.mockResolvedValue({ sessions: [session()] });
  });

  it('does nothing when the confirm dialog is cancelled', async () => {
    renderPage('steam:730');
    await flush();

    fireEvent.click(await screen.findByRole('button', { name: 'frames.drill.deleteAll' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'frames.drill.deleteAllConfirmTitle(name=Counter-Strike 2)' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'confirm.cancel' }));

    expect(deleteFpsGameMock).not.toHaveBeenCalled();
    expect(screen.getByText('Counter-Strike 2')).toBeInTheDocument();
  });

  it('deletes every session, refetches games, and returns to History', async () => {
    renderPage('steam:730');
    await flush();

    fireEvent.click(await screen.findByRole('button', { name: 'frames.drill.deleteAll' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'frames.drill.deleteAllConfirmTitle(name=Counter-Strike 2)' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'frames.drill.deleteAll' }));
    await flush();

    expect(deleteFpsGameMock).toHaveBeenCalledWith('steam:730');
    expect(refetchGamesMock).toHaveBeenCalled();
    expect(screen.queryByText('steam.action.back')).not.toBeInTheDocument();
  });
});

describe('FramesPage - Discover tab', () => {
  it('shows spec rows once loaded and the estimates-coming-soon note', async () => {
    systemSpecs = {
      pcName: 'Nexus-PC', osBuild: '26100', processor: 'Ryzen 9 9950X3D', motherboard: 'X670E',
      memory: '32 GB', storage: '2 TB NVMe', graphicsCard: 'RTX 5080', monitor: '2560x1440 @ 165Hz',
      soundCard: 'Realtek', networkCard: 'Intel',
    };
    renderPage('discover');
    await flush();

    expect(await screen.findByText('Ryzen 9 9950X3D')).toBeInTheDocument();
    expect(screen.getByText('RTX 5080')).toBeInTheDocument();
    expect(screen.getByText('frames.rig.estimatesComingSoon')).toBeInTheDocument();
  });
});
