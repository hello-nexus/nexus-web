import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchMonitoringPrivacy } from './monitoringPrivacy';
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

describe('fetchMonitoringPrivacy', () => {
  it('builds the URL with from/to', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, { supported: true, retentionDays: 7, sessions: [] }));
    vi.stubGlobal('fetch', fetchMock);

    await fetchMonitoringPrivacy({ from: 1000, to: 2000 });
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain('/monitoring/privacy?');
    expect(url).toContain('from=1000');
    expect(url).toContain('to=2000');
  });

  it('resolves the real payload on a 2xx response', async () => {
    const body = {
      supported: true, retentionDays: 7,
      sessions: [{ app: 'C:\\chrome.exe', capability: 'webcam' as const, start: 1000, end: null }],
    };
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, body)));

    expect(await fetchMonitoringPrivacy({ from: 0, to: 1000 })).toEqual({ data: body, mocked: false, unsupported: false });
  });

  it('falls back to contract-shaped mock data when the route 404s (dev only), including one active session', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(404, { error: true, msg: 'not_found' })));

    const now = Date.now();
    const result = await fetchMonitoringPrivacy({ from: now - 6 * 3_600_000, to: now });
    expect(result.mocked).toBe(true);
    expect(result.data?.supported).toBe(true);
    expect(result.data?.sessions.length).toBeGreaterThan(0);
    expect(result.data?.sessions.some(s => s.end === null)).toBe(true);
  });

  it('does not fall back to mock data on a 500 - a real error stays a real error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(500, { error: true, msg: 'server_error' })));

    expect(await fetchMonitoringPrivacy({ from: 0, to: 1000 })).toEqual({ data: null, mocked: false, unsupported: false });
  });

  it('does not fall back to mock data when the service is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down'); }));

    expect(await fetchMonitoringPrivacy({ from: 0, to: 1000 })).toEqual({ data: null, mocked: false, unsupported: false });
  });
});
