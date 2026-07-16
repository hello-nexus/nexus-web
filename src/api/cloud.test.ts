import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteCloudDevice, fetchCloudDevices, upsertCloudDevice } from './cloud';
import { setActiveTransport } from './service';

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

function emptyResponse(status: number): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => { throw new SyntaxError('Unexpected end of JSON input'); },
  } as Response;
}

beforeEach(() => {
  localStorage.setItem('nexus_token', 'test-token');
  // The jsdom origin reads as remote (no :9400/:9443 port); force the direct
  // LAN branch, matching profiles.test.ts.
  setActiveTransport('lan');
});

afterEach(() => {
  vi.unstubAllGlobals();
  setActiveTransport(null);
});

describe('fetchCloudDevices', () => {
  it('resolves the account-scoped device list on a 2xx response', async () => {
    const devices = [
      { installId: 'manual-abc', hostname: 'Battlestation', specs: { processor: 'Ryzen 9' }, manual: true, lastSeenAt: '2026-06-01T00:00:00Z' },
    ];
    const fetchMock = vi.fn(async () => jsonResponse(200, devices));
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchCloudDevices();

    expect(result).toEqual(devices);
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/cloud/account/devices');
  });

  it('resolves null on a non-2xx response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(500, {})));

    expect(await fetchCloudDevices()).toBeNull();
  });
});

describe('upsertCloudDevice', () => {
  it('PUTs to the installId route and preserves the status/body', async () => {
    const saved = { installId: 'manual-abc', hostname: 'Battlestation', specs: {}, manual: true, lastSeenAt: '2026-06-01T00:00:00Z' };
    const fetchMock = vi.fn(async () => jsonResponse(200, saved));
    vi.stubGlobal('fetch', fetchMock);

    const result = await upsertCloudDevice('manual-abc', { hostname: 'Battlestation', specs: {}, manual: true });

    expect(result).toEqual({ status: 200, body: saved });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/cloud/account/devices/manual-abc');
    expect(init.method).toBe('PUT');
    expect(init.body).toBe(JSON.stringify({ hostname: 'Battlestation', specs: {}, manual: true }));
  });

  it('preserves a device-cap rejection instead of collapsing to null', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(400, { error: true, msg: 'device_limit_reached' })));

    const result = await upsertCloudDevice('manual-new', { hostname: 'Rig', specs: {} });

    expect(result).toEqual({ status: 400, body: { error: true, msg: 'device_limit_reached' } });
  });

  it('encodes the installId into the URL path', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, {}));
    vi.stubGlobal('fetch', fetchMock);

    await upsertCloudDevice('manual/weird id', { hostname: 'Rig', specs: {} });

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain(encodeURIComponent('manual/weird id'));
  });
});

describe('deleteCloudDevice', () => {
  it('DELETEs the installId route and resolves a 2xx status with a body-less response', async () => {
    const fetchMock = vi.fn(async () => emptyResponse(204));
    vi.stubGlobal('fetch', fetchMock);

    const result = await deleteCloudDevice('manual-abc');

    expect(result.status).toBe(204);
    expect(result.body).toBeNull();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/cloud/account/devices/manual-abc');
    expect(init.method).toBe('DELETE');
  });

  it('preserves a non-2xx status', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(404, {})));

    const result = await deleteCloudDevice('manual-abc');

    expect(result.status).toBe(404);
  });
});
