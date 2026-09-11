import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSessionRecents } from './useSessionRecents';

const mockFetch = vi.fn();
const mockSave = vi.fn();

vi.mock('../api/session', () => ({
  fetchRecentApps: () => mockFetch(),
  saveRecentApps: (keys: string[]) => mockSave(keys),
}));

beforeEach(() => {
  mockFetch.mockReset();
  mockSave.mockReset();
  mockFetch.mockResolvedValue([]);
  mockSave.mockResolvedValue(null);
});

describe('useSessionRecents', () => {
  it('loads the stored keys once the service is reachable', async () => {
    mockFetch.mockResolvedValue(['monitoring', 'lighting']);

    const { result } = renderHook(() => useSessionRecents(true));
    await act(async () => {});

    expect(result.current.loaded).toBe(true);
    expect(result.current.recents).toEqual(['monitoring', 'lighting']);
  });

  it('does not read while the service is offline', async () => {
    const { result } = renderHook(() => useSessionRecents(false));
    await act(async () => {});

    expect(mockFetch).not.toHaveBeenCalled();
    expect(result.current.loaded).toBe(false);
  });

  it('drops writes until the read has answered, so the landing state never overwrites the stored one', async () => {
    let resolve!: (keys: string[]) => void;
    mockFetch.mockReturnValue(new Promise<string[]>(r => { resolve = r; }));
    const { result } = renderHook(() => useSessionRecents(true));
    await act(async () => {});

    act(() => { result.current.setRecents(['cooling']); });
    expect(mockSave).not.toHaveBeenCalled();
    expect(result.current.recents).toEqual([]);

    await act(async () => { resolve(['monitoring']); });
    expect(result.current.recents).toEqual(['monitoring']);
  });

  it('saves every write after the read', async () => {
    const { result } = renderHook(() => useSessionRecents(true));
    await act(async () => {});

    act(() => { result.current.setRecents(['monitoring', 'lighting']); });

    expect(result.current.recents).toEqual(['monitoring', 'lighting']);
    expect(mockSave).toHaveBeenCalledWith(['monitoring', 'lighting']);
  });

  it('starts empty when the read fails', async () => {
    mockFetch.mockRejectedValue(new Error('offline'));

    const { result } = renderHook(() => useSessionRecents(true));
    await act(async () => {});

    expect(result.current.loaded).toBe(true);
    expect(result.current.recents).toEqual([]);
  });
});
