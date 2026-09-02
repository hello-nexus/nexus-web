import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useSiteIcon } from './useSiteIcon';

vi.mock('../../../api/siteIcon', () => ({
  fetchSiteIcon: vi.fn(),
}));

import { fetchSiteIcon } from '../../../api/siteIcon';

describe('useSiteIcon', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
    global.URL.revokeObjectURL = vi.fn();
  });

  it('waits for typing to settle before spending a fetch permit', async () => {
    vi.mocked(fetchSiteIcon).mockResolvedValue(new Blob(['png'], { type: 'image/png' }));

    const { rerender } = renderHook(
      ({ url }) => useSiteIcon(url),
      { initialProps: { url: 'https://a.example' as string | undefined } },
    );
    // Stand-in for the inspector rewriting the slot on each keystroke.
    for (const u of ['https://ab.example', 'https://abc.example', 'https://abcd.example']) rerender({ url: u });
    await act(async () => { await new Promise(r => setTimeout(r, 550)); });

    expect(fetchSiteIcon).toHaveBeenCalledTimes(1);
    expect(fetchSiteIcon).toHaveBeenCalledWith('https://abcd.example');
  });

  it('returns null when no url is provided', () => {
    const { result } = renderHook(() => useSiteIcon(undefined));
    expect(result.current).toBeNull();
    expect(fetchSiteIcon).not.toHaveBeenCalled();
  });

  it('fetches the icon blob and returns an object URL', async () => {
    vi.mocked(fetchSiteIcon).mockResolvedValue(new Blob(['png-data'], { type: 'image/png' }));

    const { result } = renderHook(() => useSiteIcon('https://example.com'));
    await act(async () => { await new Promise(r => setTimeout(r, 550)); });

    expect(fetchSiteIcon).toHaveBeenCalledWith('https://example.com');
    expect(result.current).toBe('blob:mock-url');
  });

  it('returns null when the site has no icon', async () => {
    vi.mocked(fetchSiteIcon).mockResolvedValue(null);

    const { result } = renderHook(() => useSiteIcon('https://example.com'));
    await act(async () => { await new Promise(r => setTimeout(r, 550)); });

    expect(result.current).toBeNull();
  });

  it('revokes the old URL when the url changes', async () => {
    vi.mocked(fetchSiteIcon).mockResolvedValue(new Blob(['png'], { type: 'image/png' }));

    const { rerender } = renderHook(
      ({ url }) => useSiteIcon(url),
      { initialProps: { url: 'https://a.example' as string | undefined } },
    );
    await act(async () => { await new Promise(r => setTimeout(r, 550)); });

    rerender({ url: 'https://b.example' });

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });

  it('shares the media fetch slot cap so a page of url keys keeps pool headroom', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const releases: Array<() => void> = [];
    vi.mocked(fetchSiteIcon).mockImplementation(() => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      return new Promise<Blob>(resolve => {
        releases.push(() => { inFlight--; resolve(new Blob(['x'], { type: 'image/png' })); });
      });
    });

    const hooks = Array.from({ length: 8 }, (_, i) => renderHook(() => useSiteIcon(`https://s${i}.example`)));
    await act(async () => { await new Promise(r => setTimeout(r, 550)); });

    expect(maxInFlight).toBe(3);

    while (releases.length) {
      const release = releases.shift()!;
      await act(async () => { release(); await new Promise(r => setTimeout(r, 5)); });
    }
    expect(maxInFlight).toBe(3);
    expect(fetchSiteIcon).toHaveBeenCalledTimes(8);
    hooks.forEach(h => h.unmount());
  });
});
