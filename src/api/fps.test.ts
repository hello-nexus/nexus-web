import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  deleteFpsAll,
  fetchFpsGameSessions,
  fetchFpsGames,
  fetchFpsSessionsInRange,
  getFpsTrackingStatus,
  setFpsTrackingEnabled,
  steamGameKey,
} from './fps';
import { setActiveTransport } from './service';

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

beforeEach(() => {
  localStorage.setItem('nexus_token', 'test-token');
  setActiveTransport('lan');
});

afterEach(() => {
  vi.unstubAllGlobals();
  setActiveTransport(null);
});

describe('steamGameKey', () => {
  it('builds the steam: prefixed key', () => {
    expect(steamGameKey(730)).toBe('steam:730');
  });
});

describe('getFpsTrackingStatus', () => {
  it('GETs the tracking route', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, { enabled: true }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await getFpsTrackingStatus();

    expect(result).toEqual({ enabled: true });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/api/fps/tracking');
    expect(init.method).toBeUndefined();
  });

  it('resolves null on a network failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    expect(await getFpsTrackingStatus()).toBeNull();
  });
});

describe('setFpsTrackingEnabled', () => {
  it('POSTs the new enabled value', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, { enabled: false }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await setFpsTrackingEnabled(false);

    expect(result).toEqual({ enabled: false });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/api/fps/tracking');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ enabled: false });
  });
});

describe('deleteFpsAll', () => {
  it('DELETEs the purge route', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, { deleted: 42 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await deleteFpsAll();

    expect(result).toEqual({ deleted: 42 });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/api/fps/all');
    expect(init.method).toBe('DELETE');
  });
});

describe('fetchFpsGames', () => {
  it('resolves the games list', async () => {
    const body = { supported: true, games: [] };
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, body)));
    expect(await fetchFpsGames()).toEqual(body);
  });

  it('resolves null when the route is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(404, { error: true, msg: 'not_found' })));
    expect(await fetchFpsGames()).toBeNull();
  });
});

describe('fetchFpsGameSessions', () => {
  it('builds the URL with the gameKey and limit', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, { sessions: [] }));
    vi.stubGlobal('fetch', fetchMock);

    await fetchFpsGameSessions('steam:730', 20);

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain('/api/fps/games/steam%3A730/sessions');
    expect(url).toContain('limit=20');
  });

  it('defaults the limit to 50', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, { sessions: [] }));
    vi.stubGlobal('fetch', fetchMock);

    await fetchFpsGameSessions('steam:730');

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain('limit=50');
  });
});

describe('fetchFpsSessionsInRange', () => {
  it('builds the URL with from/to/limit', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, { sessions: [] }));
    vi.stubGlobal('fetch', fetchMock);

    await fetchFpsSessionsInRange(1000, 2000, 50);

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain('/api/fps/sessions?');
    expect(url).toContain('from=1000');
    expect(url).toContain('to=2000');
    expect(url).toContain('limit=50');
  });

  it('defaults the limit to 200', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, { sessions: [] }));
    vi.stubGlobal('fetch', fetchMock);

    await fetchFpsSessionsInRange(1000, 2000);

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain('limit=200');
  });

  it('resolves the sessions list', async () => {
    const body = { sessions: [{ id: 's1', gameKey: 'steam:730', name: 'Counter-Strike 2', store: 'steam', startedUtcMs: 1000, endedUtcMs: 2000, avgFps: 132 }] };
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, body)));
    expect(await fetchFpsSessionsInRange(1000, 2000)).toEqual(body);
  });
});
