import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { readCachedGames, writeCachedGames } from './gameSyncGamesCache';
import type { GameSyncGame } from '../../../../api/lighting';

// Mirrors the module's host scoping.
const KEY = `nexus_gamesync_supported_games_v1:${location.host}`;

function game(overrides: Partial<GameSyncGame> = {}): GameSyncGame {
  return {
    name: 'A Game',
    store: 'steam',
    appId: '730',
    emitsChroma: true,
    emitsGsi: false,
    scannedFiles: 12,
    skippedFiles: 3,
    ...overrides,
  };
}

describe('gameSyncGamesCache', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('round-trips the fields a row draws', () => {
    writeCachedGames([game({ name: 'Dead Cells', store: 'steam', appId: '588650' })]);
    expect(readCachedGames()).toEqual([
      expect.objectContaining({ name: 'Dead Cells', store: 'steam', appId: '588650', emitsChroma: true }),
    ]);
  });

  it('does not persist the scan counters', () => {
    writeCachedGames([game({ scannedFiles: 400, skippedFiles: 9 })]);
    expect(JSON.parse(localStorage.getItem(KEY)!)[0]).not.toHaveProperty('scannedFiles');
    // Reads report zero rather than inventing a count they never observed.
    expect(readCachedGames()[0].scannedFiles).toBe(0);
  });

  it('returns an empty list when nothing is cached', () => {
    expect(readCachedGames()).toEqual([]);
  });

  it('stores an empty list, so an uninstalled game does not linger', () => {
    writeCachedGames([game()]);
    writeCachedGames([]);
    expect(readCachedGames()).toEqual([]);
  });

  it('drops the whole cache when an entry is malformed rather than rendering half a list', () => {
    localStorage.setItem(KEY, JSON.stringify([{ name: 'ok', store: 's', appId: '', emitsChroma: true, emitsGsi: false }, { name: 42 }]));
    expect(readCachedGames()).toEqual([]);
  });

  it('survives a non-array blob and unparseable JSON', () => {
    localStorage.setItem(KEY, '{"not":"an array"}');
    expect(readCachedGames()).toEqual([]);
    localStorage.setItem(KEY, 'not json at all');
    expect(readCachedGames()).toEqual([]);
  });

  it('returns an empty list when storage access throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(readCachedGames()).toEqual([]);
  });

  it('swallows a failing write - a full store must not break the pane', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    expect(() => writeCachedGames([game()])).not.toThrow();
  });
});
