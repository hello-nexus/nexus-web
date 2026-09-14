import { useState } from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FramesPage } from './FramesPage';
import type { FpsGameSummary, FpsSessionsResponse } from '../../../api/fps';
import type { UseFpsEstimatesResult } from '../../../hooks/useFpsEstimates';
import type { UseFpsGamesResult } from '../../../hooks/useFpsGames';
import type { SystemSpecs } from '../../../hooks/useSystemSpecs';
import type { FpsTableGameItem } from '../../../types/fps-estimates';

const getFpsTrackingStatusMock = vi.fn();
const fetchFpsGameSessionsMock = vi.fn();
const deleteFpsSessionMock = vi.fn();
const deleteFpsGameMock = vi.fn();
vi.mock('../../../api/fps', () => ({
  getFpsTrackingStatus: () => getFpsTrackingStatusMock(),
  fetchFpsGameSessions: (gameKey: string, limit?: number) => fetchFpsGameSessionsMock(gameKey, limit),
  deleteFpsSession: (id: string) => deleteFpsSessionMock(id),
  deleteFpsGame: (gameKey: string) => deleteFpsGameMock(gameKey),
  fpsGameArtUrl: (gameKey: string, iconOnly = false) =>
    `/api/fps/games/${encodeURIComponent(gameKey)}/art${iconOnly ? '?iconOnly=true' : ''}`,
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

let fpsEstimatesResult: UseFpsEstimatesResult = { status: 'loading', games: [], gamesByKey: new Map(), resClass: null };
const useFpsEstimatesMock = vi.fn<(res?: string) => UseFpsEstimatesResult>(() => fpsEstimatesResult);
vi.mock('../../../hooks/useFpsEstimates', () => ({
  useFpsEstimates: (res?: string) => useFpsEstimatesMock(res),
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

function estimateGame(overrides: Partial<FpsTableGameItem> = {}): FpsTableGameItem {
  return {
    gameKey: 'steam:730', title: 'Counter-Strike 2', steamAppId: 730, level: 3,
    avg: 220, p1: 140, p50: 218, p99: 260, min: 90, max: 300, sessions: 40, installs: 12,
    confidence: 'medium', lowerBound: false,
    ...overrides,
  };
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
  fpsEstimatesResult = { status: 'loading', games: [], gamesByKey: new Map(), resClass: null };
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

  it('asks the service for art on every game, whatever its store', async () => {
    // Both stores go through /art: the service redirects a steam key to the
    // store CDN and answers a non-steam one with the executable's icon.
    fpsGamesResult = {
      supported: true,
      gamesByKey: gamesByKey(game(), game({ gameKey: 'epic:foo', name: 'Some Epic Game', store: 'epic', steamAppId: null })),
      refetch: refetchGamesMock,
    };
    const { container } = renderPage();
    await flush();
    await screen.findByText('Counter-Strike 2');

    const art = Array.from(container.querySelectorAll('img[src*="/art"]'));
    expect(art.map(img => img.getAttribute('src'))).toEqual([
      '/api/fps/games/steam%3A730/art',
      '/api/fps/games/epic%3Afoo/art',
    ]);
  });

  it('retries store art as the installed icon before giving up on it', async () => {
    fpsGamesResult = {
      supported: true,
      gamesByKey: gamesByKey(game({ gameKey: 'epic:foo', name: 'Some Epic Game', store: 'epic', steamAppId: null })),
      refetch: refetchGamesMock,
    };
    const { container } = renderPage();
    await flush();
    await screen.findByText('Some Epic Game');

    // A store url is a guess and can 404 in the browser, so the first failure
    // asks for the executable's icon rather than surrendering to the badge.
    fireEvent.error(container.querySelector('img[src*="/art"]')!);
    expect(container.querySelector('img[src*="iconOnly=true"]')).toBeInTheDocument();

    fireEvent.error(container.querySelector('img[src*="/art"]')!);
    expect(container.querySelector('img[src*="/art"]')).toBeNull();
  });

  it('marks the store with its own glyph beside the fps reading', async () => {
    fpsGamesResult = {
      supported: true,
      gamesByKey: gamesByKey(game(), game({ gameKey: 'epic:foo', name: 'Some Epic Game', store: 'epic', steamAppId: null })),
      refetch: refetchGamesMock,
    };
    renderPage();
    await flush();
    await screen.findByText('Counter-Strike 2');

    // Labelled rather than written out: the glyph replaced the text badge.
    expect(screen.getByRole('img', { name: 'steam' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'epic' })).toBeInTheDocument();
  });

  it('shows the 1% low value and its dim label under the avg, and drops the 99th percentile from the card face', async () => {
    fpsGamesResult = { supported: true, gamesByKey: gamesByKey(game()), refetch: refetchGamesMock };
    renderPage();
    await flush();
    await screen.findByText('Counter-Strike 2');

    expect(screen.getByText('132')).toBeInTheDocument();
    expect(screen.getByText('90')).toBeInTheDocument();
    expect(screen.getByText('steam.stat.fps1pctLow')).toBeInTheDocument();
    expect(screen.queryByText('steam.stat.fps99th')).not.toBeInTheDocument();
    expect(screen.queryByText('200')).not.toBeInTheDocument();
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

  it('renders each session as its own card in a scroller (not a shared Sessions card), and switching selection refetches the timeline', async () => {
    const s1 = session({ id: 's1', avgFps: 100, startedUtcMs: Date.now() - 2000, endedUtcMs: Date.now() - 1000 });
    const s2 = session({ id: 's2', avgFps: 200, startedUtcMs: Date.now() - 4000, endedUtcMs: Date.now() - 3000 });
    fetchFpsGameSessionsMock.mockResolvedValue({ sessions: [s1, s2] });
    renderPage('steam:730');
    await flush();

    // "Sessions" labels both the stat tile and the session-list section
    // header - neither is a Card title (which would render an <h4>), since
    // the list is a plain SectionHeader above a scroller now, not a Card.
    const sessionsLabels = await screen.findAllByText('frames.stat.sessions');
    expect(sessionsLabels.some(el => el.tagName === 'H4')).toBe(false);

    // Each session gets its own delete button, one per card.
    expect(screen.getAllByRole('button', { name: 'frames.session.deleteAria' })).toHaveLength(2);

    // The first session is auto-selected on load.
    expect(fetchMonitoringHistoryMock).toHaveBeenCalledWith({ from: s1.startedUtcMs, to: s1.endedUtcMs, series: 'fps' });

    fetchMonitoringHistoryMock.mockClear();
    fireEvent.click(screen.getByText('steam.fps.sessionAvg(value=200)'));
    await flush();

    expect(fetchMonitoringHistoryMock).toHaveBeenCalledWith({ from: s2.startedUtcMs, to: s2.endedUtcMs, series: 'fps' });
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
  beforeEach(() => {
    systemSpecs = {
      pcName: 'Nexus-PC', osBuild: '26100', processor: 'Ryzen 9 9950X3D', motherboard: 'X670E',
      memory: '32 GB', storage: '2 TB NVMe', graphicsCard: 'RTX 5080', monitor: '2560x1440 @ 165Hz',
      soundCard: 'Realtek', networkCard: 'Intel',
    };
  });

  function ready(...games: FpsTableGameItem[]): UseFpsEstimatesResult {
    return { status: 'ready', games, gamesByKey: new Map(games.map(g => [g.gameKey, g])), resClass: '1920x1080' };
  }

  it('asks for 1920x1080 by default and re-asks for the chip picked, without any rig spec panel', async () => {
    fpsEstimatesResult = ready(estimateGame());
    renderPage('discover');
    await flush();

    expect(useFpsEstimatesMock).toHaveBeenLastCalledWith('1920x1080');
    expect(screen.queryByText('Ryzen 9 9950X3D')).not.toBeInTheDocument();
    const chips = within(screen.getByRole('radiogroup', { name: 'frames.discover.resolution' }));
    expect(chips.getByRole('radio', { name: '1920×1080' })).toBeChecked();

    fireEvent.click(chips.getByRole('radio', { name: '3840×2160' }));
    await flush();
    expect(useFpsEstimatesMock).toHaveBeenLastCalledWith('3840x2160');
  });

  it('shows a spinner, not an empty state, while a table is loading', async () => {
    fpsEstimatesResult = { status: 'loading', games: [], gamesByKey: new Map(), resClass: null };
    renderPage('discover');
    await flush();

    expect(screen.getByRole('img', { name: 'common.loading' })).toBeInTheDocument();
    expect(screen.queryByText('frames.discover.empty.title')).not.toBeInTheDocument();
  });

  it('says the community data is unavailable, not empty, when the rig cannot be resolved', async () => {
    fpsEstimatesResult = { status: 'unresolved', games: [], gamesByKey: new Map(), resClass: null };
    renderPage('discover');
    await flush();

    expect(screen.getByText('frames.discover.unavailable')).toBeInTheDocument();
    expect(screen.queryByText('frames.discover.empty.title')).not.toBeInTheDocument();
    expect(screen.queryByText('steam.library.count(count=0)')).not.toBeInTheDocument();
  });

  it('shows the no-community-data empty state when the table has no games yet', async () => {
    fpsEstimatesResult = { status: 'empty', games: [], gamesByKey: new Map(), resClass: '1920x1080' };
    renderPage('discover');
    await flush();

    expect(await screen.findByText('frames.discover.empty.title')).toBeInTheDocument();
    expect(screen.getByText('frames.discover.empty.hint')).toBeInTheDocument();
  });

  it('lists a community estimate with its avg at the picked resolution, level label, and confidence mark, and no install count', async () => {
    fpsEstimatesResult = ready(estimateGame());
    renderPage('discover');
    await flush();

    expect(await screen.findByText('Counter-Strike 2')).toBeInTheDocument();
    expect(screen.getByText('220')).toBeInTheDocument();
    expect(screen.getByText('@ 1920×1080')).toBeInTheDocument();
    expect(screen.getByText('frames.discover.level.3')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'frames.discover.confidence.medium' })).toBeInTheDocument();
    expect(screen.queryByText(/frames\.discover\.basedOn/)).not.toBeInTheDocument();
    expect(screen.getByText('steam.library.count(count=1)')).toBeInTheDocument();
  });

  it('labels the fps with the resolution it was measured at and notes the missing one when the cloud fell back', async () => {
    fpsEstimatesResult = ready(estimateGame({ resBasis: '3840x2160' }));
    renderPage('discover');
    await flush();

    expect(await screen.findByText('@ 3840×2160')).toBeInTheDocument();
    expect(screen.getByText(/frames\.discover\.resBasis\(res=1920×1080\)/)).toBeInTheDocument();
  });

  it('omits the fallback note when resBasis matches the picked resolution', async () => {
    fpsEstimatesResult = ready(estimateGame({ resBasis: '1920x1080' }));
    renderPage('discover');
    await flush();

    expect(await screen.findByText('@ 1920×1080')).toBeInTheDocument();
    expect(screen.queryByText(/frames\.discover\.resBasis/)).not.toBeInTheDocument();
  });

  it('filters estimates by title from the search box', async () => {
    fpsEstimatesResult = ready(estimateGame(), estimateGame({ gameKey: 'steam:570', title: 'Dota 2' }));
    renderPage('discover');
    await flush();

    fireEvent.change(screen.getByPlaceholderText('frames.discover.searchPlaceholder'), { target: { value: 'dota' } });
    expect(screen.getByText('Dota 2')).toBeInTheDocument();
    expect(screen.queryByText('Counter-Strike 2')).not.toBeInTheDocument();
    expect(screen.getByText('steam.library.countFiltered(count=1,total=2)')).toBeInTheDocument();
  });

  it('falls back to the controller placeholder once store art and icon both fail', async () => {
    fpsEstimatesResult = ready(estimateGame({ gameKey: 'epic:alanwake2', title: 'Alan Wake 2', steamAppId: null }));
    const { container } = renderPage('discover');
    await flush();

    const art = () => container.querySelector('img[src^="/api/fps/games/epic%3Aalanwake2/art"]') as HTMLImageElement | null;
    fireEvent.error(art()!);
    fireEvent.error(art()!);
    expect(art()).toBeNull();
    expect(container.querySelector('svg.lucide-gamepad-2')).not.toBeNull();
  });
});
