import { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FramesPage } from './FramesPage';
import type { FpsGameSummary, FpsSessionsResponse } from '../../../api/fps';
import type { UseFpsGamesResult } from '../../../hooks/useFpsGames';
import type { SystemSpecs } from '../../../hooks/useSystemSpecs';

const getFpsTrackingStatusMock = vi.fn();
const fetchFpsGameSessionsMock = vi.fn();
vi.mock('../../../api/fps', () => ({
  getFpsTrackingStatus: () => getFpsTrackingStatusMock(),
  fetchFpsGameSessions: (gameKey: string, limit?: number) => fetchFpsGameSessionsMock(gameKey, limit),
}));

const fetchMonitoringHistoryMock = vi.fn();
vi.mock('../../../api/monitoringHistory', () => ({
  fetchMonitoringHistory: (query: unknown) => fetchMonitoringHistoryMock(query),
}));

let fpsGamesResult: UseFpsGamesResult = { supported: true, gamesByKey: new Map() };
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
  fpsGamesResult = { supported: true, gamesByKey: new Map() };
  systemSpecs = null;
  getFpsTrackingStatusMock.mockReset().mockResolvedValue({ enabled: true });
  fetchFpsGameSessionsMock.mockReset().mockResolvedValue({ sessions: [] });
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

describe('FramesPage - library states', () => {
  it('shows the unsupported message when the platform has no fps capture', async () => {
    fpsGamesResult = { supported: false, gamesByKey: new Map() };
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

  it('shows the empty state when tracking is on but no games have data', async () => {
    renderPage();
    await flush();
    expect(await screen.findByText('frames.empty.title')).toBeInTheDocument();
  });

  it('lists every game and filters by search', async () => {
    fpsGamesResult = { supported: true, gamesByKey: new Map([
      ['steam:730', game()],
      ['steam:440', game({ gameKey: 'steam:440', name: 'Team Fortress 2', steamAppId: 440 })],
    ]) };
    renderPage();
    await flush();

    expect(await screen.findByText('Counter-Strike 2')).toBeInTheDocument();
    expect(screen.getByText('Team Fortress 2')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('steam.library.searchPlaceholder'), { target: { value: 'team' } });
    expect(screen.queryByText('Counter-Strike 2')).not.toBeInTheDocument();
    expect(screen.getByText('Team Fortress 2')).toBeInTheDocument();
  });
});

describe('FramesPage - game detail', () => {
  beforeEach(() => {
    fpsGamesResult = { supported: true, gamesByKey: new Map([['steam:730', game()]]) };
  });

  it('opens the detail view on row click and fetches its sessions', async () => {
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

describe('FramesPage - Rig tab', () => {
  it('shows spec rows once loaded and the estimates-coming-soon note', async () => {
    systemSpecs = {
      pcName: 'Nexus-PC', osBuild: '26100', processor: 'Ryzen 9 9950X3D', motherboard: 'X670E',
      memory: '32 GB', storage: '2 TB NVMe', graphicsCard: 'RTX 5080', monitor: '2560x1440 @ 165Hz',
      soundCard: 'Realtek', networkCard: 'Intel',
    };
    renderPage('rig');
    await flush();

    expect(await screen.findByText('Ryzen 9 9950X3D')).toBeInTheDocument();
    expect(screen.getByText('RTX 5080')).toBeInTheDocument();
    expect(screen.getByText('frames.rig.estimatesComingSoon')).toBeInTheDocument();
  });
});
