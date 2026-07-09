import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cancelMemoryTest,
  clearDiagnosticsEventLogs,
  downloadDiagnosticsBundle,
  downloadDiagnosticsReport,
  fetchDiagnosticsGpu,
  fetchDiagnosticsHealth,
  fetchDiagnosticsIncidents,
  fetchDiagnosticsTemperatures,
  openDiagnosticsEventViewer,
  scheduleMemoryTest,
} from './diagnostics';
import { setActiveTransport } from './service';

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    blob: async () => new Blob([JSON.stringify(body)]),
    headers: new Headers(headers),
  } as unknown as Response;
}

beforeEach(() => {
  localStorage.setItem('nexus_token', 'test-token');
  // jsdom's http://localhost/ origin (no port) reads as remote; force the
  // direct LAN branch so these calls hit window.fetch, matching the other
  // api/*.test.ts files (see profiles.test.ts).
  setActiveTransport('lan');
});

afterEach(() => {
  vi.unstubAllGlobals();
  setActiveTransport(null);
});

describe('fetchDiagnosticsHealth', () => {
  it('resolves the real payload on a 2xx response', async () => {
    const health = { generatedAt: '2026-07-08T02:00:00Z', supported: true, overall: 'ok' as const, components: [] };
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, health)));

    expect(await fetchDiagnosticsHealth()).toEqual({ data: health, mocked: false });
  });

  it('falls back to contract-shaped mock data when the route 404s (dev only)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(404, { error: true, msg: 'not_found' })));

    const result = await fetchDiagnosticsHealth();
    expect(result.mocked).toBe(true);
    expect(result.data?.supported).toBe(true);
    expect(Array.isArray(result.data?.components)).toBe(true);
  });

  it('does not fall back to mock data on a 500 - a real error stays a real error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(500, { error: true, msg: 'server_error' })));

    expect(await fetchDiagnosticsHealth()).toEqual({ data: null, mocked: false });
  });

  it('does not fall back to mock data when the service is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down'); }));

    expect(await fetchDiagnosticsHealth()).toEqual({ data: null, mocked: false });
  });

  it('appends ?refresh=1 when force is requested', async () => {
    const health = { generatedAt: '2026-07-08T02:00:00Z', supported: true, overall: 'ok' as const, components: [] };
    const fetchMock = vi.fn(async () => jsonResponse(200, health));
    vi.stubGlobal('fetch', fetchMock);

    await fetchDiagnosticsHealth({ force: true });
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain('/diagnostics/health?refresh=1');
  });

  it('omits the refresh param on a plain (non-forced) fetch', async () => {
    const health = { generatedAt: '2026-07-08T02:00:00Z', supported: true, overall: 'ok' as const, components: [] };
    const fetchMock = vi.fn(async () => jsonResponse(200, health));
    vi.stubGlobal('fetch', fetchMock);

    await fetchDiagnosticsHealth();
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).not.toContain('refresh=1');
  });
});

describe('fetchDiagnosticsIncidents', () => {
  it('requests the given days window', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, { supported: true, windowDays: 7, incidents: [] }));
    vi.stubGlobal('fetch', fetchMock);

    await fetchDiagnosticsIncidents(7);
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain('/diagnostics/incidents?days=7');
  });

  it('defaults to a 30 day window', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, { supported: true, windowDays: 30, incidents: [] }));
    vi.stubGlobal('fetch', fetchMock);

    await fetchDiagnosticsIncidents();
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain('/diagnostics/incidents?days=30');
  });
});

describe('fetchDiagnosticsGpu', () => {
  it('falls back to mock GPU data with a throttling GPU when the route 404s', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(404, {})));

    const result = await fetchDiagnosticsGpu();
    expect(result.mocked).toBe(true);
    expect(result.data?.gpus.length).toBeGreaterThan(0);
    expect(result.data?.gpus[0].throttle.active.length).toBeGreaterThan(0);
  });
});

describe('fetchDiagnosticsTemperatures', () => {
  it('requests the given hours window', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, { supported: true, bucketMinutes: 5, series: [], episodes: [] }));
    vi.stubGlobal('fetch', fetchMock);

    await fetchDiagnosticsTemperatures(72);
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain('/diagnostics/temperatures?hours=72');
  });

  it('falls back to contract-shaped mock data (cpu/gpu/storage) when the route 404s', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(404, {})));

    const result = await fetchDiagnosticsTemperatures(168);
    expect(result.mocked).toBe(true);
    expect(result.data?.bucketMinutes).toBe(5);
    const kinds = result.data?.series.map(s => s.kind).sort();
    expect(kinds).toEqual(['cpu', 'gpu', 'storage']);
    expect(result.data?.episodes.length).toBeGreaterThan(0);
  });

  it('mock episodes drop out of a narrow 24h window that predates the spike', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(404, {})));

    const result = await fetchDiagnosticsTemperatures(24);
    expect(result.data?.episodes.length).toBe(0);
  });

  it('does not fall back to mock data on a 500', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(500, {})));
    expect(await fetchDiagnosticsTemperatures(168)).toEqual({ data: null, mocked: false });
  });
});

describe('scheduleMemoryTest / cancelMemoryTest', () => {
  it('resolves the real payload on a 2xx response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, { scheduled: true, requiresReboot: true })));
    expect(await scheduleMemoryTest()).toEqual({ data: { scheduled: true, requiresReboot: true }, mocked: false });
  });

  it('falls back to the mock scheduler when the route 404s, so the confirm flow stays exercisable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(404, {})));
    expect(await scheduleMemoryTest()).toEqual({ data: { scheduled: true, requiresReboot: true }, mocked: true });
    expect(await cancelMemoryTest()).toEqual({ data: { scheduled: false }, mocked: true });
  });

  it('does not fall back to mock data on a 500', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(500, {})));
    expect(await scheduleMemoryTest()).toEqual({ data: null, mocked: false });
  });
});

describe('openDiagnosticsEventViewer', () => {
  it('resolves the real payload on a 2xx response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, { opened: true })));
    expect(await openDiagnosticsEventViewer()).toEqual({ data: { opened: true }, mocked: false });
  });

  it('falls back to the mock when the route 404s', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(404, {})));
    expect(await openDiagnosticsEventViewer()).toEqual({ data: { opened: true }, mocked: true });
  });

  it('does not fall back to mock data on a 500', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(500, {})));
    expect(await openDiagnosticsEventViewer()).toEqual({ data: null, mocked: false });
  });
});

describe('clearDiagnosticsEventLogs', () => {
  it('resolves the real payload on a 2xx response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, { cleared: true })));
    expect(await clearDiagnosticsEventLogs()).toEqual({ data: { cleared: true }, mocked: false });
  });

  it('falls back to the mock when the route 404s', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(404, {})));
    expect(await clearDiagnosticsEventLogs()).toEqual({ data: { cleared: true }, mocked: true });
  });

  it('does not fall back to mock data on a 500 - a real error stays a real error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(500, {})));
    expect(await clearDiagnosticsEventLogs()).toEqual({ data: null, mocked: false });
  });
});

describe('downloadDiagnosticsBundle', () => {
  it('returns false when the bundle route fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(404, {})));
    expect(await downloadDiagnosticsBundle()).toBe(false);
  });

  it('uses the server Content-Disposition filename when present', async () => {
    const realCreateObjectUrl = URL.createObjectURL;
    const realRevokeObjectUrl = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn(() => 'blob:test');
    URL.revokeObjectURL = vi.fn();
    let downloadedName = '';
    const realCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = realCreateElement(tag);
      if (tag === 'a') {
        Object.defineProperty(el, 'download', {
          get: () => downloadedName,
          set: (v: string) => { downloadedName = v; },
        });
        el.click = vi.fn();
      }
      return el;
    });

    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, {}, { 'Content-Disposition': 'attachment; filename="nexus-diagnostics-y70-20260708-0900.zip"' })));

    expect(await downloadDiagnosticsBundle()).toBe(true);
    expect(downloadedName).toBe('nexus-diagnostics-y70-20260708-0900.zip');

    vi.restoreAllMocks();
    URL.createObjectURL = realCreateObjectUrl;
    URL.revokeObjectURL = realRevokeObjectUrl;
  });
});

describe('downloadDiagnosticsReport', () => {
  it('returns false when the report route fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(404, {})));
    expect(await downloadDiagnosticsReport()).toBe(false);
  });

  it('requests /diagnostics/report.pdf and uses the server Content-Disposition filename', async () => {
    const realCreateObjectUrl = URL.createObjectURL;
    const realRevokeObjectUrl = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn(() => 'blob:test');
    URL.revokeObjectURL = vi.fn();
    let downloadedName = '';
    const realCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = realCreateElement(tag);
      if (tag === 'a') {
        Object.defineProperty(el, 'download', {
          get: () => downloadedName,
          set: (v: string) => { downloadedName = v; },
        });
        el.click = vi.fn();
      }
      return el;
    });

    const fetchMock = vi.fn(async () => jsonResponse(200, {}, { 'Content-Disposition': 'attachment; filename="nexus-diagnostics-y70-20260708-0900.pdf"' }));
    vi.stubGlobal('fetch', fetchMock);

    expect(await downloadDiagnosticsReport()).toBe(true);
    expect(downloadedName).toBe('nexus-diagnostics-y70-20260708-0900.pdf');
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain('/diagnostics/report.pdf');

    vi.restoreAllMocks();
    URL.createObjectURL = realCreateObjectUrl;
    URL.revokeObjectURL = realRevokeObjectUrl;
  });
});
