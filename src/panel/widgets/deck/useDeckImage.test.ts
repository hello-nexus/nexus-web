import { StrictMode } from 'react';
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
    expect(result.current.url).toBeNull();
  });

  it('fetches the image blob and returns an object URL', async () => {
    const mockBlob = new Blob(['png-data'], { type: 'image/png' });
    vi.mocked(fetchDeckImage).mockResolvedValue(mockBlob);

    const { result } = renderHook(() => useDeckImage('abc123'));

    await act(async () => { await new Promise(r => setTimeout(r, 10)); });

    expect(fetchDeckImage).toHaveBeenCalledWith('abc123');
    expect(result.current.url).toBe('blob:mock-url');
  });

  it('flags video blobs by their content type', async () => {
    vi.mocked(fetchDeckImage).mockResolvedValue(new Blob(['v'], { type: 'video/mp4' }));
    const { result } = renderHook(() => useDeckImage('vid'));
    await act(async () => { await new Promise(r => setTimeout(r, 10)); });
    expect(result.current).toEqual({ url: 'blob:mock-url', isVideo: true });
  });

  it('does not flag png or gif blobs as video', async () => {
    for (const type of ['image/png', 'image/gif']) {
      vi.mocked(fetchDeckImage).mockResolvedValue(new Blob(['i'], { type }));
      const { result } = renderHook(() => useDeckImage(`img-${type}`));
      await act(async () => { await new Promise(r => setTimeout(r, 10)); });
      expect(result.current.isVideo).toBe(false);
    }
  });

  it('shares one fetch and one object URL per id, revoked when the last user unmounts', async () => {
    vi.mocked(fetchDeckImage).mockResolvedValue(new Blob(['i'], { type: 'image/png' }));
    const a = renderHook(() => useDeckImage('shared'));
    const b = renderHook(() => useDeckImage('shared'));
    await act(async () => { await new Promise(r => setTimeout(r, 10)); });

    expect(fetchDeckImage).toHaveBeenCalledTimes(1);
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(a.result.current.url).toBe('blob:mock-url');
    expect(b.result.current.url).toBe('blob:mock-url');

    a.unmount();
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    b.unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });

  it('a second user acquiring while the first fetch is pending shares it', async () => {
    let resolveFetch!: (b: Blob) => void;
    vi.mocked(fetchDeckImage).mockReturnValue(new Promise<Blob>(r => { resolveFetch = r; }));
    const a = renderHook(() => useDeckImage('pending'));
    const b = renderHook(() => useDeckImage('pending'));
    await act(async () => { await new Promise(r => setTimeout(r, 10)); });
    expect(fetchDeckImage).toHaveBeenCalledTimes(1);

    await act(async () => { resolveFetch(new Blob(['i'], { type: 'image/png' })); await new Promise(r => setTimeout(r, 10)); });
    expect(a.result.current.url).toBe('blob:mock-url');
    expect(b.result.current.url).toBe('blob:mock-url');
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
  });

  it('survives StrictMode mount, unmount, mount and revokes every created URL on unmount', async () => {
    let n = 0;
    global.URL.createObjectURL = vi.fn(() => `blob:strict-${++n}`);
    vi.mocked(fetchDeckImage).mockResolvedValue(new Blob(['i'], { type: 'image/png' }));
    const { result, unmount } = renderHook(() => useDeckImage('strict'), { wrapper: StrictMode });
    await act(async () => { await new Promise(r => setTimeout(r, 10)); });

    expect(result.current.url).toMatch(/^blob:strict-/);
    unmount();
    expect(vi.mocked(URL.revokeObjectURL).mock.calls.length).toBe(vi.mocked(URL.createObjectURL).mock.calls.length);
  });

  it('drops a failed fetch so the next user refetches', async () => {
    vi.mocked(fetchDeckImage).mockResolvedValueOnce(null);
    const a = renderHook(() => useDeckImage('flaky'));
    await act(async () => { await new Promise(r => setTimeout(r, 10)); });
    expect(a.result.current.url).toBeNull();

    vi.mocked(fetchDeckImage).mockResolvedValueOnce(new Blob(['i'], { type: 'image/png' }));
    const b = renderHook(() => useDeckImage('flaky'));
    await act(async () => { await new Promise(r => setTimeout(r, 10)); });
    expect(fetchDeckImage).toHaveBeenCalledTimes(2);
    expect(b.result.current.url).toBe('blob:mock-url');
    a.unmount();
    b.unmount();
  });

  it('returns null when the fetch fails', async () => {
    vi.mocked(fetchDeckImage).mockResolvedValue(null);

    const { result } = renderHook(() => useDeckImage('missing'));

    await act(async () => { await new Promise(r => setTimeout(r, 10)); });

    expect(result.current.url).toBeNull();
  });

  it('returns null when the blob is empty', async () => {
    const emptyBlob = new Blob([], { type: 'image/png' });
    vi.mocked(fetchDeckImage).mockResolvedValue(emptyBlob);

    const { result } = renderHook(() => useDeckImage('empty'));

    await act(async () => { await new Promise(r => setTimeout(r, 10)); });

    expect(result.current.url).toBeNull();
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
    expect(result.current.url).toBe('blob:mock-url');

    rerender({ id: undefined });
    expect(result.current.url).toBeNull();
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
