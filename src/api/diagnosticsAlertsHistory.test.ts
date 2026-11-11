import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchSensorAlertHistory } from './diagnosticsAlerts';
import { setActiveTransport } from './service';

const jsonResponse = (status: number, body: unknown): Response => (
  { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response
);

beforeEach(() => {
  localStorage.setItem('nexus_token', 'test-token');
  setActiveTransport('lan');
});

afterEach(() => {
  vi.unstubAllGlobals();
  setActiveTransport(null);
});

describe('fetchSensorAlertHistory', () => {
  it('calls the alerts history route with from, to and maxPoints, and drops the series filter', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, { supported: true, retentionDays: 90, stepSeconds: 1, series: [] }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await fetchSensorAlertHistory({ from: 1000, to: 2000, maxPoints: 600, series: 'sensorAlert' });
    const [url] = fetchMock.mock.calls[0] as unknown as [string];
    expect(url).toContain('/diagnostics/alerts/history-series?');
    expect(url).toContain('from=1000');
    expect(url).toContain('maxPoints=600');
    expect(url).not.toContain('series=');
    expect(result).toMatchObject({ mocked: false, unsupported: false });
    expect(result.data?.retentionDays).toBe(90);
  });

  it('reports a missing route as unsupported and any other failure as an error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(404, null)));
    expect(await fetchSensorAlertHistory({ from: 1, to: 2 })).toEqual({ data: null, mocked: false, unsupported: true });
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(500, null)));
    expect(await fetchSensorAlertHistory({ from: 1, to: 2 })).toEqual({ data: null, mocked: false, unsupported: false });
  });
});
