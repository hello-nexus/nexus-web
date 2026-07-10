import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useStreamDecks } from './useStreamDecks';
import { getStreamDecks } from '../api/streamdeck';

// Defense in depth: even if a caller mis-gates and passes enabled=true, a
// remote-origin session (paired phone / panel kiosk) must never fetch
// /streamdeck/* - see the isRemoteOrigin AND check in useStreamDecks.
vi.mock('../api/streamdeck', () => ({ getStreamDecks: vi.fn() }));
vi.mock('../api/service', () => ({ isRemoteOrigin: true }));
vi.mock('./useMultiplexSocket', () => ({ useTopicCallback: () => {} }));

const mockGetDecks = vi.mocked(getStreamDecks);

afterEach(() => {
  vi.clearAllMocks();
});

describe('useStreamDecks on a remote origin', () => {
  it('never fetches decks even when the caller passes enabled=true', async () => {
    renderHook(() => useStreamDecks(true));
    await act(async () => { await Promise.resolve(); });
    expect(mockGetDecks).not.toHaveBeenCalled();
  });
});
