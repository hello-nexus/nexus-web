// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

// The transport helpers are replaced by thin wrappers over a mocked fetch, so
// the test sees the method, path and JSON body the client really sends.
vi.mock('./service', () => {
  const call = async (path: string, method: string, body?: unknown) => {
    const response = await fetch(`http://localhost:9400${path}`, {
      method,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return response;
  };
  return {
    authFetchWithStatus: async (path: string, opts: { method?: string; body?: unknown } = {}) => {
      const response = await call(path, opts.method ?? 'GET', opts.body);
      return { response, status: response.status };
    },
    putService: async (path: string, body: unknown) => {
      const r = await call(path, 'PUT', body);
      return r.ok ? await r.json() : null;
    },
    isTunnelActive: () => false,
    isRemoteOrigin: false,
    isForceLanMode: () => false,
    isLocalhostUnreachable: () => false,
    loopbackFetchInit: {},
    relayRequestWithStatus: vi.fn(),
    RELAY_BOOT_TIMEOUT_MS: 6000,
    resolveHttp: (path: string) => path,
    fetchService: vi.fn(),
    postService: vi.fn(),
    deleteService: vi.fn(),
  };
});
vi.mock('./auth', () => ({ getToken: vi.fn(), handleUnauthorized: vi.fn() }));

import { fetchStreamSettings, setStreamFpsCap } from './panel';

afterEach(() => vi.unstubAllGlobals());

describe('stream settings client', () => {
  it('sends a null cap as {"fpsCap":null} in a PUT body', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ fpsCap: null }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const r = await setStreamFpsCap(null);
    expect(r).toEqual({ fpsCap: null });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://localhost:9400/panel/streams/settings');
    expect(init.method).toBe('PUT');
    expect(init.body).toBe('{"fpsCap":null}');
  });

  it('returns null from the PUT on a 400', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 400 })));
    expect(await setStreamFpsCap(7)).toBeNull();
  });

  it('reads the cap from the GET', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ fpsCap: 30 }), { status: 200 })));
    expect(await fetchStreamSettings()).toEqual({ fpsCap: 30 });
  });

  it('maps a 404 (older service) to null', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })));
    expect(await fetchStreamSettings()).toBeNull();
  });
});
