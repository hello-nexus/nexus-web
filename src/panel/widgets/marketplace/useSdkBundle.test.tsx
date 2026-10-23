// useSdkBundle hands out one bundle URL per installed app version: switching the
// caller to another app never yields the previous app's bundle, and an app
// updated on disk resolves to a new URL.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

const versions = new Map<string, string>();
const listeners = new Set<() => void>();
let expiresInSeconds: number | undefined = 3600;
const postService = vi.fn(async (path: string) => ({ sessionId: 's', baseUrl: path.replace('/code-session', ''), expiresInSeconds }));
const fetchServiceBlob = vi.fn<(path?: string) => Promise<Blob | null>>(async () => new Blob(['export default 1;']));
let remoteOrigin = false;
let forceLan = false;

vi.mock('../../../api/service', () => ({
  postService: (path: string) => postService(path),
  fetchServiceBlob: (path: string) => fetchServiceBlob(path),
  get isRemoteOrigin() { return remoteOrigin; },
  isForceLanMode: () => forceLan,
}));
vi.mock('../../../widgets/marketplaceRegistry', () => ({
  getMarketplaceListing: (id: string) => (versions.has(id) ? { id, version: versions.get(id) } : undefined),
  subscribeMarketplaceRegistry: (fn: () => void) => { listeners.add(fn); return () => listeners.delete(fn); },
}));

let minted = 0;
URL.createObjectURL = vi.fn(() => `blob:${++minted}`);

async function loadHook() {
  vi.resetModules();
  return (await import('./useSdkBundle')).useSdkBundle;
}

describe('useSdkBundle', () => {
  beforeEach(() => {
    versions.clear();
    listeners.clear();
    postService.mockClear();
  });

  it('never hands a caller switched to another app the previous app bundle', async () => {
    const useSdkBundle = await loadHook();
    versions.set('com.x.hyte', '1.0.0');
    versions.set('com.x.ibp', '1.0.0');
    const { result, rerender } = renderHook(({ id }) => useSdkBundle(id), { initialProps: { id: 'com.x.hyte' } });
    await waitFor(() => expect(result.current.entryUrl).not.toBeNull());
    const hyte = result.current.entryUrl;

    rerender({ id: 'com.x.ibp' });
    expect(result.current.entryUrl).toBeNull();
    await waitFor(() => expect(result.current.entryUrl).not.toBeNull());
    expect(result.current.entryUrl).not.toBe(hyte);
  });

  it('resolves a new bundle when the installed version changes', async () => {
    const useSdkBundle = await loadHook();
    versions.set('com.x.app', '1.0.0');
    const { result } = renderHook(() => useSdkBundle('com.x.app'));
    await waitFor(() => expect(result.current.entryUrl).not.toBeNull());
    const v1 = result.current.entryUrl;

    act(() => { versions.set('com.x.app', '1.1.0'); for (const fn of listeners) fn(); });
    await waitFor(() => expect(result.current.entryUrl).not.toBeNull());
    expect(result.current.entryUrl).not.toBe(v1);
    expect(postService).toHaveBeenCalledTimes(2);
  });

  it('instances resolving one app version together share one bundle', async () => {
    const useSdkBundle = await loadHook();
    versions.set('com.x.app', '1.0.0');
    const a = renderHook(() => useSdkBundle('com.x.app'));
    const b = renderHook(() => useSdkBundle('com.x.app'));
    await waitFor(() => expect(a.result.current.entryUrl).not.toBeNull());
    await waitFor(() => expect(b.result.current.entryUrl).not.toBeNull());
    expect(b.result.current.entryUrl).toBe(a.result.current.entryUrl);
    expect(postService).toHaveBeenCalledTimes(1);
  });

  it('fetches nothing until the registry lists the app', async () => {
    const useSdkBundle = await loadHook();
    const { result } = renderHook(() => useSdkBundle('com.x.unknown'));
    await act(async () => { await Promise.resolve(); });
    expect(result.current.entryUrl).toBeNull();
    expect(postService).not.toHaveBeenCalled();
  });
});

describe('useSdkRuntime', () => {
  beforeEach(() => {
    fetchServiceBlob.mockClear();
    vi.restoreAllMocks();
  });

  it('loads the runtime from the page origin on a website desktop', async () => {
    remoteOrigin = true;
    forceLan = true;
    const pageFetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('export {};'));
    vi.resetModules();
    const { useSdkRuntime } = await import('./useSdkBundle');
    const { result } = renderHook(() => useSdkRuntime());
    await waitFor(() => expect(result.current.runtimeUrl).not.toBeNull());
    expect(pageFetch).toHaveBeenCalledWith('/sdk-runtime.mjs');
    expect(fetchServiceBlob).not.toHaveBeenCalled();
  });

  it('loads the runtime through the service client when the page is served by the service', async () => {
    remoteOrigin = false;
    forceLan = false;
    const pageFetch = vi.spyOn(globalThis, 'fetch');
    vi.resetModules();
    const { useSdkRuntime } = await import('./useSdkBundle');
    const { result } = renderHook(() => useSdkRuntime());
    await waitFor(() => expect(result.current.runtimeUrl).not.toBeNull());
    expect(fetchServiceBlob).toHaveBeenCalledTimes(1);
    expect(pageFetch).not.toHaveBeenCalled();
  });

  describe('fetchBundleFile', () => {
    beforeEach(() => {
      postService.mockClear();
      fetchServiceBlob.mockReset().mockResolvedValue(new Blob(['x']));
      expiresInSeconds = 3600;
    });

    it('reuses one code-session for files of the same app version', async () => {
      vi.resetModules();
      const { fetchBundleFile } = await import('./useSdkBundle');
      await fetchBundleFile('com.x.app', 'renderer.mjs', '1.0.0');
      await fetchBundleFile('com.x.app', 'other.bin', '1.0.0');
      expect(postService).toHaveBeenCalledTimes(1);
      await fetchBundleFile('com.x.app', 'renderer.mjs', '2.0.0');
      expect(postService).toHaveBeenCalledTimes(2);
    });

    it('mints a fresh session once when the code route refuses the cached one', async () => {
      vi.resetModules();
      const { fetchBundleFile } = await import('./useSdkBundle');
      await fetchBundleFile('com.x.app', 'a.bin', '1.0.0');
      fetchServiceBlob.mockResolvedValueOnce(null);
      const blob = await fetchBundleFile('com.x.app', 'b.bin', '1.0.0');
      expect(blob).not.toBeNull();
      expect(postService).toHaveBeenCalledTimes(2);
    });

    it('fails after one re-mint', async () => {
      vi.resetModules();
      const { fetchBundleFile } = await import('./useSdkBundle');
      fetchServiceBlob.mockResolvedValue(null);
      expect(await fetchBundleFile('com.x.app', 'a.bin', '1.0.0')).toBeNull();
      expect(postService).toHaveBeenCalledTimes(2);
    });

    it('does not reuse a session whose response carries no lifetime', async () => {
      vi.resetModules();
      expiresInSeconds = undefined;
      const { fetchBundleFile } = await import('./useSdkBundle');
      await fetchBundleFile('com.x.app', 'a.bin', '1.0.0');
      await fetchBundleFile('com.x.app', 'a.bin', '1.0.0');
      expect(postService).toHaveBeenCalledTimes(2);
    });
  });
});
