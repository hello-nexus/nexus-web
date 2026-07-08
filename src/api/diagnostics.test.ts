import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cancelMemoryTest,
  downloadDiagnosticsBundle,
  fetchDiagnosticsGpu,
  fetchDiagnosticsHealth,
  fetchDiagnosticsIncidents,
  scheduleMemoryTest,
} from './diagnostics';
import { setActiveTransport } from './service';

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    blob: async () => new Blob([JSON.stringify(body)]),
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

    expect(await fetchDiagnosticsHealth()).toEqual(health);
  });

  it('falls back to contract-shaped mock data when the route 404s (dev only)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(404, { error: true, msg: 'not_found' })));

    const result = await fetchDiagnosticsHealth();
    expect(result).not.toBeNull();
    expect(result?.supported).toBe(true);
    expect(Array.isArray(result?.components)).toBe(true);
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
  it('falls back to mock GPU data with a throttling GPU on failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down'); }));

    const result = await fetchDiagnosticsGpu();
    expect(result?.gpus.length).toBeGreaterThan(0);
    expect(result?.gpus[0].throttle.active.length).toBeGreaterThan(0);
  });
});

describe('scheduleMemoryTest / cancelMemoryTest', () => {
  it('resolves the real payload on a 2xx response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, { scheduled: true, requiresReboot: true })));
    expect(await scheduleMemoryTest()).toEqual({ scheduled: true, requiresReboot: true });
  });

  it('falls back to the mock scheduler on failure so the confirm flow stays exercisable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(404, {})));
    expect(await scheduleMemoryTest()).toEqual({ scheduled: true, requiresReboot: true });
    expect(await cancelMemoryTest()).toEqual({ scheduled: false });
  });
});

describe('downloadDiagnosticsBundle', () => {
  it('returns false when the bundle route fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(404, {})));
    expect(await downloadDiagnosticsBundle()).toBe(false);
  });
});
