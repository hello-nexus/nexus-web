import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAppIcon } from './AppPicker';

vi.mock('../../../api/service', () => ({
  fetchService: vi.fn(),
  fetchServiceBlob: vi.fn(),
}));

import { fetchServiceBlob } from '../../../api/service';

describe('useAppIcon', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
    global.URL.revokeObjectURL = vi.fn();
  });

  it('returns null when no appId provided', () => {
    const { result } = renderHook(() => useAppIcon(undefined));
    expect(result.current).toBeNull();
  });

  it('fetches icon blob and returns object URL', async () => {
    const mockBlob = new Blob(['png-data'], { type: 'image/png' });
    vi.mocked(fetchServiceBlob).mockResolvedValue(mockBlob);

    const { result } = renderHook(() => useAppIcon('com.spotify.client'));

    await act(async () => {
      await new Promise(r => setTimeout(r, 10));
    });

    expect(fetchServiceBlob).toHaveBeenCalledWith(
      '/shortcuts/icon?targetId=com.spotify.client'
    );
    expect(result.current).toBe('blob:mock-url');
  });

  it('returns null when blob fetch fails', async () => {
    vi.mocked(fetchServiceBlob).mockResolvedValue(null);

    const { result } = renderHook(() => useAppIcon('missing-app'));

    await act(async () => {
      await new Promise(r => setTimeout(r, 10));
    });

    expect(result.current).toBeNull();
  });

  it('returns null when blob is empty', async () => {
    const emptyBlob = new Blob([], { type: 'image/png' });
    vi.mocked(fetchServiceBlob).mockResolvedValue(emptyBlob);

    const { result } = renderHook(() => useAppIcon('empty-icon'));

    await act(async () => {
      await new Promise(r => setTimeout(r, 10));
    });

    expect(result.current).toBeNull();
  });

  it('revokes old URL when appId changes', async () => {
    const mockBlob = new Blob(['png'], { type: 'image/png' });
    vi.mocked(fetchServiceBlob).mockResolvedValue(mockBlob);

    const { rerender } = renderHook(
      ({ id }) => useAppIcon(id),
      { initialProps: { id: 'app-1' as string | undefined } }
    );

    await act(async () => {
      await new Promise(r => setTimeout(r, 10));
    });

    rerender({ id: 'app-2' });

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });

  it('encodes special characters in targetId', async () => {
    vi.mocked(fetchServiceBlob).mockResolvedValue(null);

    renderHook(() => useAppIcon('app with spaces!'));

    await act(async () => {
      await new Promise(r => setTimeout(r, 10));
    });

    expect(fetchServiceBlob).toHaveBeenCalledWith(
      '/shortcuts/icon?targetId=app%20with%20spaces!'
    );
  });

  // Many launch buttons / picker rows mounting at once must not occupy all 6
  // browser connections and starve the panel's /ping (the false-offline bug).
  it('caps concurrent icon fetches so the connection pool keeps headroom', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const releases: Array<() => void> = [];
    vi.mocked(fetchServiceBlob).mockImplementation(() => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      return new Promise<Blob>(resolve => {
        releases.push(() => { inFlight--; resolve(new Blob(['x'], { type: 'image/png' })); });
      });
    });

    const hooks = Array.from({ length: 8 }, (_, i) => renderHook(() => useAppIcon(`app-${i}`)));
    await act(async () => { await new Promise(r => setTimeout(r, 10)); });

    // Only the cap (3) start; the rest queue behind the permits.
    expect(maxInFlight).toBe(3);
    expect(releases.length).toBe(3);

    // Draining one admits exactly one queued fetch - never exceeding the cap.
    while (releases.length) {
      const release = releases.shift()!;
      await act(async () => { release(); await new Promise(r => setTimeout(r, 5)); });
    }
    expect(maxInFlight).toBe(3);
    expect(fetchServiceBlob).toHaveBeenCalledTimes(8);
    hooks.forEach(h => h.unmount());
  });
});
