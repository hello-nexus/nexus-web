import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useStreamDecks } from './useStreamDecks';
import { getStreamDecks, updateStreamDeck, type StreamDeckSummary } from '../api/streamdeck';

vi.mock('../api/streamdeck', () => ({
  getStreamDecks: vi.fn(),
  updateStreamDeck: vi.fn(),
}));

vi.mock('../api/service', () => ({ isRemoteOrigin: false }));

let capturedTopicCallback: ((data: unknown) => void) | null = null;
vi.mock('./useMultiplexSocket', () => ({
  useTopicCallback: (_topic: string, enabled: boolean, cb: (data: unknown) => void) => {
    capturedTopicCallback = enabled ? cb : null;
  },
}));

const mockGetDecks = vi.mocked(getStreamDecks);
const mockUpdate = vi.mocked(updateStreamDeck);

function makeDeck(over: Partial<StreamDeckSummary> = {}): StreamDeckSummary {
  return {
    serial: 'ABC123',
    model: 'Mini',
    name: 'Stream Deck Mini',
    connected: true,
    verified: true,
    rows: 2,
    cols: 3,
    keyCount: 6,
    keyPixels: 80,
    format: 'bmp',
    brightness: 60,
    ...over,
  };
}

const flush = () => act(async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
});

beforeEach(() => {
  capturedTopicCallback = null;
  mockGetDecks.mockResolvedValue([]);
  mockUpdate.mockResolvedValue(true);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('useStreamDecks', () => {
  it('does not fetch when disabled', async () => {
    renderHook(() => useStreamDecks(false));
    await flush();
    expect(mockGetDecks).not.toHaveBeenCalled();
  });

  it('fetches decks on mount when enabled and reports loaded', async () => {
    const deck = makeDeck();
    mockGetDecks.mockResolvedValue([deck]);

    const { result } = renderHook(() => useStreamDecks(true));
    expect(result.current.loaded).toBe(false);
    await flush();

    expect(mockGetDecks).toHaveBeenCalledTimes(1);
    expect(result.current.loaded).toBe(true);
    expect(result.current.decks).toEqual([deck]);
  });

  it('refetches on a streamdeck topic push', async () => {
    mockGetDecks.mockResolvedValue([makeDeck()]);
    renderHook(() => useStreamDecks(true));
    await flush();
    expect(mockGetDecks).toHaveBeenCalledTimes(1);

    mockGetDecks.mockResolvedValue([makeDeck({ brightness: 80 })]);
    await act(async () => { capturedTopicCallback?.({ kind: 'config' }); });
    await flush();

    expect(mockGetDecks).toHaveBeenCalledTimes(2);
  });

  it('clears decks and stops subscribing when disabled after being enabled', async () => {
    mockGetDecks.mockResolvedValue([makeDeck()]);
    const { result, rerender } = renderHook(({ enabled }) => useStreamDecks(enabled), {
      initialProps: { enabled: true },
    });
    await flush();
    expect(result.current.decks).toHaveLength(1);
    expect(capturedTopicCallback).not.toBeNull();

    rerender({ enabled: false });
    await flush();

    expect(result.current.decks).toEqual([]);
    expect(result.current.loaded).toBe(false);
    expect(capturedTopicCallback).toBeNull();
  });

  it('rename optimistically updates then reverts on failure', async () => {
    mockGetDecks.mockResolvedValue([makeDeck({ name: 'Old name' })]);
    const { result } = renderHook(() => useStreamDecks(true));
    await flush();

    mockUpdate.mockResolvedValueOnce(false);
    mockGetDecks.mockResolvedValueOnce([makeDeck({ name: 'Old name' })]);

    let ok = true;
    await act(async () => { ok = await result.current.rename('ABC123', 'New name'); });
    await flush();

    expect(mockUpdate).toHaveBeenCalledWith('ABC123', { name: 'New name' });
    expect(ok).toBe(false);
    // Failure triggers a refresh that restores the server-truth name.
    expect(result.current.decks[0].name).toBe('Old name');
  });

  it('setBrightness optimistically updates and keeps the value on success', async () => {
    mockGetDecks.mockResolvedValue([makeDeck({ brightness: 40 })]);
    const { result } = renderHook(() => useStreamDecks(true));
    await flush();

    let ok = false;
    act(() => { void result.current.setBrightness('ABC123', 90).then(v => { ok = v; }); });
    // Optimistic update lands synchronously.
    expect(result.current.decks[0].brightness).toBe(90);

    await flush();
    expect(ok).toBe(true);
    expect(mockUpdate).toHaveBeenCalledWith('ABC123', { brightness: 90 });
  });

  it('setOrientation optimistically updates and keeps the value on success', async () => {
    mockGetDecks.mockResolvedValue([makeDeck({ orientation: 0 })]);
    const { result } = renderHook(() => useStreamDecks(true));
    await flush();

    let ok = false;
    act(() => { void result.current.setOrientation('ABC123', 90).then(v => { ok = v; }); });
    expect(result.current.decks[0].orientation).toBe(90);

    await flush();
    expect(ok).toBe(true);
    expect(mockUpdate).toHaveBeenCalledWith('ABC123', { orientation: 90 });
  });

  it('setOrientation reverts through a refresh on failure', async () => {
    mockGetDecks.mockResolvedValue([makeDeck({ orientation: 0 })]);
    const { result } = renderHook(() => useStreamDecks(true));
    await flush();

    mockUpdate.mockResolvedValueOnce(false);
    mockGetDecks.mockResolvedValueOnce([makeDeck({ orientation: 0 })]);

    let ok = true;
    await act(async () => { ok = await result.current.setOrientation('ABC123', 180); });
    await flush();

    expect(ok).toBe(false);
    expect(result.current.decks[0].orientation).toBe(0);
  });

  it('setSleepAfterSeconds optimistically updates and keeps the value on success', async () => {
    mockGetDecks.mockResolvedValue([makeDeck({ sleepAfterSeconds: 0 })]);
    const { result } = renderHook(() => useStreamDecks(true));
    await flush();

    let ok = false;
    act(() => { void result.current.setSleepAfterSeconds('ABC123', 300).then(v => { ok = v; }); });
    expect(result.current.decks[0].sleepAfterSeconds).toBe(300);

    await flush();
    expect(ok).toBe(true);
    expect(mockUpdate).toHaveBeenCalledWith('ABC123', { sleepAfterSeconds: 300 });
  });

  it('setSleepWhenLocked optimistically updates and keeps the value on success', async () => {
    mockGetDecks.mockResolvedValue([makeDeck({ sleepWhenLocked: true })]);
    const { result } = renderHook(() => useStreamDecks(true));
    await flush();

    let ok = false;
    act(() => { void result.current.setSleepWhenLocked('ABC123', false).then(v => { ok = v; }); });
    expect(result.current.decks[0].sleepWhenLocked).toBe(false);

    await flush();
    expect(ok).toBe(true);
    expect(mockUpdate).toHaveBeenCalledWith('ABC123', { sleepWhenLocked: false });
  });
});
