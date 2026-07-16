import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchMonitoringHistory } from './monitoringHistory';
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
  // jsdom's http://localhost/ origin (no port) reads as remote; force the
  // direct LAN branch so these calls hit window.fetch, matching the other
  // api/*.test.ts files (see diagnostics.test.ts).
  setActiveTransport('lan');
});

afterEach(() => {
  vi.unstubAllGlobals();
  setActiveTransport(null);
});

describe('fetchMonitoringHistory', () => {
  it('builds the URL with from/to/maxPoints/series', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, { supported: true, retentionDays: 7, stepSeconds: 60, series: [] }));
    vi.stubGlobal('fetch', fetchMock);

    await fetchMonitoringHistory({ from: 1000, to: 2000, maxPoints: 800, series: 'cpu,cpu-temp' });
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain('/monitoring/history?');
    expect(url).toContain('from=1000');
    expect(url).toContain('to=2000');
    expect(url).toContain('maxPoints=800');
    expect(url).toContain('series=cpu%2Ccpu-temp');
  });

  it('omits maxPoints and series when not given', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, { supported: true, retentionDays: 7, stepSeconds: 60, series: [] }));
    vi.stubGlobal('fetch', fetchMock);

    await fetchMonitoringHistory({ from: 1000, to: 2000 });
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).not.toContain('maxPoints=');
    expect(url).not.toContain('series=');
  });

  it('resolves the real payload on a 2xx response', async () => {
    const body = { supported: true, retentionDays: 7, stepSeconds: 1, series: [{ id: 'cpu', kind: 'cpu' as const, name: 'CPU', points: [{ t: 1000, avg: 12.3, max: 15.0 }] }] };
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, body)));

    expect(await fetchMonitoringHistory({ from: 0, to: 1000 })).toEqual({ data: body, mocked: false });
  });

  it('falls back to contract-shaped mock data when the route 404s (dev only)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(404, { error: true, msg: 'not_found' })));

    const now = Date.now();
    const result = await fetchMonitoringHistory({ from: now - 3_600_000, to: now, series: 'cpu' });
    expect(result.mocked).toBe(true);
    expect(result.data?.supported).toBe(true);
    expect(result.data?.series.map(s => s.id)).toEqual(['cpu']);
    expect(result.data?.series[0].points.length).toBeGreaterThan(0);
  });

  it('a bare kind token matches every id of that kind (gpu matches gpu:0)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(404, {})));

    const now = Date.now();
    const result = await fetchMonitoringHistory({ from: now - 3_600_000, to: now, series: 'gpu,gpu-temp' });
    const ids = (result.data?.series ?? []).map(s => s.id).sort();
    expect(ids).toEqual(['gpu-temp:0', 'gpu:0']);
  });

  it('does not fall back to mock data on a 500 - a real error stays a real error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(500, { error: true, msg: 'server_error' })));

    expect(await fetchMonitoringHistory({ from: 0, to: 1000 })).toEqual({ data: null, mocked: false });
  });

  it('does not fall back to mock data when the service is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down'); }));

    expect(await fetchMonitoringHistory({ from: 0, to: 1000 })).toEqual({ data: null, mocked: false });
  });
});
