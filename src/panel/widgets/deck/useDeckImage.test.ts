import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useDeckImage } from './useDeckImage';

vi.mock('../../../api/deckImages', () => ({
  fetchDeckImage: vi.fn(),
}));

import { fetchDeckImage } from '../../../api/deckImages';

describe('useDeckImage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
    global.URL.revokeObjectURL = vi.fn();
  });

  it('returns null when no id is provided', () => {
    const { result } = renderHook(() => useDeckImage(undefined));
    expect(result.current).toBeNull();
  });

  it('fetches the image blob and returns an object URL', async () => {
    const mockBlob = new Blob(['png-data'], { type: 'image/png' });
    vi.mocked(fetchDeckImage).mockResolvedValue(mockBlob);

    const { result } = renderHook(() => useDeckImage('abc123'));

    await act(async () => { await new Promise(r => setTimeout(r, 10)); });

    expect(fetchDeckImage).toHaveBeenCalledWith('abc123');
    expect(result.current).toBe('blob:mock-url');
  });

  it('returns null when the fetch fails', async () => {
    vi.mocked(fetchDeckImage).mockResolvedValue(null);

    const { result } = renderHook(() => useDeckImage('missing'));

    await act(async () => { await new Promise(r => setTimeout(r, 10)); });

    expect(result.current).toBeNull();
  });

  it('returns null when the blob is empty', async () => {
    const emptyBlob = new Blob([], { type: 'image/png' });
    vi.mocked(fetchDeckImage).mockResolvedValue(emptyBlob);

    const { result } = renderHook(() => useDeckImage('empty'));

    await act(async () => { await new Promise(r => setTimeout(r, 10)); });

    expect(result.current).toBeNull();
  });

  it('revokes the old URL when the id changes', async () => {
    const mockBlob = new Blob(['png'], { type: 'image/png' });
    vi.mocked(fetchDeckImage).mockResolvedValue(mockBlob);

    const { rerender } = renderHook(
      ({ id }) => useDeckImage(id),
      { initialProps: { id: 'img-1' as string | undefined } },
    );

    await act(async () => { await new Promise(r => setTimeout(r, 10)); });

    rerender({ id: 'img-2' });

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });

  it('resets to null immediately when the id is cleared', async () => {
    const mockBlob = new Blob(['png'], { type: 'image/png' });
    vi.mocked(fetchDeckImage).mockResolvedValue(mockBlob);

    const { result, rerender } = renderHook(
      ({ id }) => useDeckImage(id),
      { initialProps: { id: 'img-1' as string | undefined } },
    );
    await act(async () => { await new Promise(r => setTimeout(r, 10)); });
    expect(result.current).toBe('blob:mock-url');

    rerender({ id: undefined });
    expect(result.current).toBeNull();
  });

  it('caps concurrent image fetches so the connection pool keeps headroom', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const releases: Array<() => void> = [];
    vi.mocked(fetchDeckImage).mockImplementation(() => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      return new Promise<Blob>(resolve => {
        releases.push(() => { inFlight--; resolve(new Blob(['x'], { type: 'image/png' })); });
      });
    });

    const hooks = Array.from({ length: 8 }, (_, i) => renderHook(() => useDeckImage(`img-${i}`)));
    await act(async () => { await new Promise(r => setTimeout(r, 10)); });

    expect(maxInFlight).toBe(3);
    expect(releases.length).toBe(3);

    while (releases.length) {
      const release = releases.shift()!;
      await act(async () => { release(); await new Promise(r => setTimeout(r, 5)); });
    }
    expect(maxInFlight).toBe(3);
    expect(fetchDeckImage).toHaveBeenCalledTimes(8);
    hooks.forEach(h => h.unmount());
  });
});
