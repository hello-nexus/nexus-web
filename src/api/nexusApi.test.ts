import { afterEach, describe, expect, it, vi } from 'vitest';
import { getFpsSignature, getFpsTable } from './nexusApi';
import type { FpsSignatureResponse, FpsTableResponse } from '../types/fps-estimates';

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('getFpsSignature', () => {
  const signature: FpsSignatureResponse = {
    sigKey: 'a'.repeat(64),
    resolved: {
      gpu: 'NVIDIA GeForce RTX 5080', cpu: 'AMD Ryzen 9 9950X3D', mobo: null,
      ramTier: 32, resClass: '2560x1440', hz: 165, levels: [3, 5],
    },
  };

  it('builds the query string with every field and GETs /fps/signature', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, signature));
    vi.stubGlobal('fetch', fetchMock);

    const result = await getFpsSignature({
      gpu: 'NVIDIA GeForce RTX 5080', cpu: 'AMD Ryzen 9 9950X3D', mobo: 'X670E',
      ramBytes: 34_359_738_368, res: '2560x1440', hz: 165,
    });

    expect(result).toEqual(signature);
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain('/fps/signature?');
    expect(url).toContain('gpu=NVIDIA');
    expect(url).toContain('cpu=AMD');
    expect(url).toContain('mobo=X670E');
    expect(url).toContain('ramBytes=34359738368');
    expect(url).toContain('res=2560x1440');
    expect(url).toContain('hz=165');
  });

  it('omits gpu/cpu/mobo/ramBytes/hz from the query when unresolved', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, signature));
    vi.stubGlobal('fetch', fetchMock);

    await getFpsSignature({ res: '1920x1080' });

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain('res=1920x1080');
    expect(url).not.toContain('gpu=');
    expect(url).not.toContain('cpu=');
    expect(url).not.toContain('mobo=');
    expect(url).not.toContain('ramBytes=');
    expect(url).not.toContain('hz=');
  });

  it('retries a transient 500 with backoff before succeeding', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(500, {}))
      .mockResolvedValueOnce(jsonResponse(200, signature));
    vi.stubGlobal('fetch', fetchMock);

    const promise = getFpsSignature({ res: '2560x1440' });
    await vi.advanceTimersByTimeAsync(1000);
    const result = await promise;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).toEqual(signature);
  });

  it('exhausts retries and resolves null on a persistent 500', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async () => jsonResponse(500, {}));
    vi.stubGlobal('fetch', fetchMock);

    const promise = getFpsSignature({ res: '2560x1440' });
    await vi.advanceTimersByTimeAsync(2000);
    const result = await promise;

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result).toBeNull();
  });

  it('resolves null immediately on a non-retryable 400, without retrying', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(400, { error: true, msg: 'bad_res' }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await getFpsSignature({ res: 'not-a-res' });

    expect(result).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('getFpsTable', () => {
  it('GETs /fps/table/{sigKey} and resolves an empty games list as valid data', async () => {
    const sigKey = 'b'.repeat(64);
    const body: FpsTableResponse = { normVersion: 1, sigKey, generatedAt: '2026-08-29T00:00:00.000Z', games: [] };
    const fetchMock = vi.fn(async () => jsonResponse(200, body));
    vi.stubGlobal('fetch', fetchMock);

    const result = await getFpsTable(sigKey);

    expect(result).toEqual(body);
    expect(result?.games).toEqual([]);
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain(`/fps/table/${sigKey}`);
  });

  it('retries a network failure before succeeding', async () => {
    vi.useFakeTimers();
    const sigKey = 'c'.repeat(64);
    const body: FpsTableResponse = { normVersion: 1, sigKey, generatedAt: '2026-08-29T00:00:00.000Z', games: [] };
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(jsonResponse(200, body));
    vi.stubGlobal('fetch', fetchMock);

    const promise = getFpsTable(sigKey);
    await vi.advanceTimersByTimeAsync(1000);
    const result = await promise;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).toEqual(body);
  });
});
