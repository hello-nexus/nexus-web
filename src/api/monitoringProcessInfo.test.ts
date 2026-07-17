import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchMonitoringProcessInfo } from './monitoringProcessInfo';
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

describe('fetchMonitoringProcessInfo', () => {
  it('builds the URL with the encoded process name', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, { supported: true, name: 'chrome.exe', instanceCount: 1 }));
    vi.stubGlobal('fetch', fetchMock);

    await fetchMonitoringProcessInfo('My App.exe');
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain('/monitoring/process-info?');
    expect(url).toContain('name=My%20App.exe');
  });

  it('resolves the real payload on a 2xx response', async () => {
    const body = {
      supported: true, name: 'chrome.exe', instanceCount: 3, path: 'C:\\chrome.exe',
      signed: true, sha256: 'abc', createdAtMs: 1000, modifiedAtMs: 2000, firstSeenMs: 500,
    };
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, body)));

    expect(await fetchMonitoringProcessInfo('chrome.exe')).toEqual({ data: body, mocked: false, unsupported: false });
  });

  it('falls back to contract-shaped mock data when the route 404s (dev only)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(404, { error: true, msg: 'not_found' })));

    const result = await fetchMonitoringProcessInfo('chrome.exe');
    expect(result.mocked).toBe(true);
    expect(result.data?.supported).toBe(true);
    expect(result.data?.name).toBe('chrome.exe');
    expect(result.data?.instanceCount).toBeGreaterThan(0);
  });

  it('resolves an unrecognized name to a plausible generic mock profile', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(404, { error: true, msg: 'not_found' })));

    const result = await fetchMonitoringProcessInfo('SomethingUnknown.exe');
    expect(result.mocked).toBe(true);
    expect(result.data?.path).toContain('SomethingUnknown.exe');
    expect(result.data?.sha256).toHaveLength(64);
  });

  it('does not fall back to mock data on a 500 - a real error stays a real error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(500, { error: true, msg: 'server_error' })));

    expect(await fetchMonitoringProcessInfo('chrome.exe')).toEqual({ data: null, mocked: false, unsupported: false });
  });

  it('does not fall back to mock data when the service is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down'); }));

    expect(await fetchMonitoringProcessInfo('chrome.exe')).toEqual({ data: null, mocked: false, unsupported: false });
  });
});
