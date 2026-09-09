import { act, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { GameSyncLeftPane } from './GameSyncLeftPane';
import { readCachedGames, writeCachedGames } from './gameSyncGamesCache';
import type { GameSyncGame } from '../../../../api/lighting';

vi.mock('../../../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
    language: 'en',
  }),
}));

const api = vi.hoisted(() => ({
  fetchGameSyncGames: vi.fn(),
  triggerGameSyncScan: vi.fn(),
}));
vi.mock('../../../../api/lighting', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../../api/lighting')>();
  return {
    ...actual,
    fetchGameSyncGames: api.fetchGameSyncGames,
    triggerGameSyncScan: api.triggerGameSyncScan,
  };
});

function game(name: string): GameSyncGame {
  return { name, store: 'steam', appId: '', emitsChroma: true, emitsGsi: false, scannedFiles: 0, skippedFiles: 0 };
}

describe('GameSyncLeftPane', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    api.triggerGameSyncScan.mockResolvedValue(undefined);
  });

  afterEach(() => vi.useRealTimers());

  it('keeps the cached list across the whole scan a restarted service runs', async () => {
    vi.useFakeTimers();
    writeCachedGames([game('Dead Cells')]);
    // A restarted service reports an empty list with scannedAt null for the
    // entire scan - the poll must not adopt it.
    api.fetchGameSyncGames.mockResolvedValue({ scanning: true, scannedAt: null, games: [] });

    render(<GameSyncLeftPane />);
    expect(screen.getByText('Dead Cells')).toBeInTheDocument();

    await act(async () => { await vi.advanceTimersByTimeAsync(3 * 2000); });

    expect(screen.getByText('Dead Cells')).toBeInTheDocument();
    expect(screen.queryByText('lighting.gameSync.games.scanning')).not.toBeInTheDocument();
  });

  it('adopts the scan result the poll finally returns, and caches it', async () => {
    vi.useFakeTimers();
    writeCachedGames([game('Dead Cells')]);
    api.fetchGameSyncGames.mockResolvedValue({ scanning: true, scannedAt: null, games: [] });

    render(<GameSyncLeftPane />);
    api.fetchGameSyncGames.mockResolvedValue({
      scanning: false, scannedAt: 1_700_000_000, games: [game('Factorio')],
    });
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });

    expect(screen.getByText('Factorio')).toBeInTheDocument();
    expect(screen.queryByText('Dead Cells')).not.toBeInTheDocument();
    expect(readCachedGames().map(g => g.name)).toEqual(['Factorio']);
  });

  it('caches an empty completed scan, so an uninstalled game does not linger', async () => {
    writeCachedGames([game('Dead Cells')]);
    api.fetchGameSyncGames.mockResolvedValue({ scanning: false, scannedAt: 1_700_000_000, games: [] });

    render(<GameSyncLeftPane />);

    await waitFor(() => expect(screen.getByText('lighting.gameSync.games.none')).toBeInTheDocument());
    expect(screen.queryByText('Dead Cells')).not.toBeInTheDocument();
    expect(readCachedGames()).toEqual([]);
  });

  it('does not stop polling on a not-yet-busy scan that has no result', async () => {
    vi.useFakeTimers();
    // The window between requesting a scan and the worker flagging itself busy.
    api.fetchGameSyncGames.mockResolvedValue({ scanning: false, scannedAt: null, games: [] });

    render(<GameSyncLeftPane />);
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });

    api.fetchGameSyncGames.mockResolvedValue({
      scanning: false, scannedAt: 1_700_000_000, games: [game('Factorio')],
    });
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });

    expect(screen.getByText('Factorio')).toBeInTheDocument();
  });

  it('links the header button at the guide section that lists supported titles', async () => {
    api.fetchGameSyncGames.mockResolvedValue({ scanning: false, scannedAt: 1_700_000_000, games: [game('A')] });

    render(<GameSyncLeftPane />);

    const link = await screen.findByRole('link', { name: /lighting\.gameSync\.games\.title/ });
    expect(link).toHaveAttribute(
      'href',
      'https://hellonexus.com/docs/guides/lighting/game-sync#which-games-are-supported',
    );
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('disables Rescan while a scan is running', async () => {
    api.fetchGameSyncGames.mockResolvedValue({ scanning: true, scannedAt: 1_700_000_000, games: [] });

    render(<GameSyncLeftPane />);

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /lighting\.gameSync\.games\.rescan/ })).toBeDisabled(),
    );
  });
});
