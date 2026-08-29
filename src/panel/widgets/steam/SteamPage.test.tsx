import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SteamPage } from './SteamPage';
import {
  fetchSteamAchievements,
  fetchSteamAppDetails,
  fetchSteamCurrentPlayers,
  fetchSteamFriends,
  fetchSteamGlobalAchievements,
  fetchSteamNews,
  fetchSteamOwnedGames,
  fetchSteamProfile,
  fetchSteamStatus,
  fetchSteamUserStats,
  type SteamOwnedGame,
} from '../../../api/steam';
import { fetchFpsGames, type FpsGamesResponse } from '../../../api/fps';
import { requestOpenFramesGame } from '../frames/framesNav';

vi.mock('../../../api/steam', () => ({
  fetchSteamStatus: vi.fn(),
  fetchSteamProfile: vi.fn(),
  fetchSteamOwnedGames: vi.fn(),
  fetchSteamFriends: vi.fn(),
  fetchSteamNews: vi.fn(),
  fetchSteamAchievements: vi.fn(),
  fetchSteamAppDetails: vi.fn(),
  fetchSteamGlobalAchievements: vi.fn(),
  fetchSteamUserStats: vi.fn(),
  fetchSteamCurrentPlayers: vi.fn(),
  launchSteam: vi.fn(),
}));

vi.mock('../../../api/fps', () => ({
  fetchFpsGames: vi.fn(),
  steamGameKey: (appId: number) => `steam:${appId}`,
}));

vi.mock('../frames/framesNav', () => ({
  requestOpenFramesGame: vi.fn(),
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

vi.mock('./SteamSettings', () => ({ SteamSettings: () => null }));

const CS: SteamOwnedGame = { appId: 730, name: 'Counter-Strike 2', playtimeForever: 6000, playtime2Weeks: 120, iconHash: '' };
const TF2: SteamOwnedGame = { appId: 440, name: 'Team Fortress 2', playtimeForever: 3000, playtime2Weeks: 0, iconHash: '' };

function fpsGames(): FpsGamesResponse {
  return {
    supported: true,
    games: [
      { gameKey: 'steam:730', name: 'Counter-Strike 2', store: 'steam', steamAppId: 730,
        sessions: 5, focusedSec: 18_000, avgFps: 132.4, p1Fps: 89.6, p99Fps: 201.2, minFps: 40, maxFps: 240,
        lastPlayedUtcMs: 1_700_000_000_000 },
    ],
  };
}

// Panel widgets have no real layout engine under jsdom - the virtualized
// library's ResizeObserver-driven sizing reads clientWidth/clientHeight, which
// jsdom reports as 0 for every element, collapsing the visible tile slice to
// empty. A flat nonzero stub lets the grid actually lay out tiles (see
// MixerWidget.test.tsx for the same trick).
beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 900 });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 600 });

  vi.mocked(fetchSteamStatus).mockResolvedValue({ error: false, msg: '', ready: true, hasApiKey: true, steamId: '1', reason: '' });
  vi.mocked(fetchSteamProfile).mockResolvedValue({
    error: false, msg: '', level: 10,
    profile: {
      steamId: '1', personaName: 'Nova', profileUrl: '', avatar: '', avatarMedium: '', avatarFull: '',
      personaState: 1, communityVisibilityState: 3, lastLogoff: null, gameExtraInfo: null, gameId: null,
    },
  });
  vi.mocked(fetchSteamOwnedGames).mockResolvedValue([CS, TF2]);
  vi.mocked(fetchSteamFriends).mockResolvedValue([]);
  vi.mocked(fetchSteamNews).mockResolvedValue([]);
  vi.mocked(fetchSteamAchievements).mockResolvedValue([]);
  vi.mocked(fetchSteamAppDetails).mockResolvedValue(null);
  vi.mocked(fetchSteamGlobalAchievements).mockResolvedValue([]);
  vi.mocked(fetchSteamUserStats).mockResolvedValue([]);
  vi.mocked(fetchSteamCurrentPlayers).mockResolvedValue(null);
  vi.mocked(fetchFpsGames).mockResolvedValue(fpsGames());
});

afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(HTMLElement.prototype, 'clientWidth');
  Reflect.deleteProperty(HTMLElement.prototype, 'clientHeight');
});

const flush = () => act(async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
});

describe('SteamPage - GameTile FPS chip', () => {
  it('shows the chip only for the game with FPS data', async () => {
    render(<SteamPage />);
    await flush();

    expect(await screen.findByText('steam.fps.chip(value=132)')).toBeInTheDocument();
    // Team Fortress 2 has no FPS summary - no second chip anywhere.
    expect(screen.queryAllByText(/steam\.fps\.chip\(/)).toHaveLength(1);
  });

  it('renders nothing extra when the FPS route reports no data', async () => {
    vi.mocked(fetchFpsGames).mockResolvedValue({ supported: true, games: [] });
    render(<SteamPage />);
    await flush();

    await screen.findByText('Counter-Strike 2');
    expect(screen.queryByText(/steam\.fps\.chip\(/)).not.toBeInTheDocument();
  });

  it('keeps the tile\'s own accessible name pinned to the game name, not absorbing the nested chip\'s label', async () => {
    // A button with no aria-label of its own would otherwise inherit the
    // nested chip's aria-label text into its computed accessible name.
    render(<SteamPage />);
    await flush();

    expect(await screen.findByRole('button', { name: 'Counter-Strike 2' })).toBeInTheDocument();
  });
});

describe('SteamPage - FPS chip deep-links into Frames', () => {
  it('opens Frames for the chip\'s own game without opening the Steam drilldown', async () => {
    render(<SteamPage />);
    await flush();

    const chip = await screen.findByRole('button', { name: 'steam.fps.chipAriaLabel(name=Counter-Strike 2)' });
    fireEvent.click(chip);

    expect(requestOpenFramesGame).toHaveBeenCalledWith('steam:730');
    // The tile's own click (opening the Steam drilldown) never fires.
    expect(screen.queryByText('steam.action.back')).not.toBeInTheDocument();
  });

  it('activates on Enter and Space, same as a click', async () => {
    render(<SteamPage />);
    await flush();
    vi.mocked(requestOpenFramesGame).mockClear();

    const chip = await screen.findByRole('button', { name: 'steam.fps.chipAriaLabel(name=Counter-Strike 2)' });
    fireEvent.keyDown(chip, { key: 'Enter' });
    expect(requestOpenFramesGame).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(chip, { key: ' ' });
    expect(requestOpenFramesGame).toHaveBeenCalledTimes(2);
  });

  it('no longer renders any FPS stats or sessions inside the Steam drilldown itself', async () => {
    render(<SteamPage />);
    await flush();

    fireEvent.click(await screen.findByText('Counter-Strike 2'));
    await flush();

    expect(screen.queryByText('steam.stat.fpsAvg')).not.toBeInTheDocument();
    expect(screen.queryByText('steam.drill.recentFpsSessions')).not.toBeInTheDocument();
  });
});
