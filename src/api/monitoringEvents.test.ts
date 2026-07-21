import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCustomEvent, deleteCustomEvent, fetchMonitoringEvents } from './monitoringEvents';
import { setActiveTransport } from './service';

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

function emptyResponse(status: number): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => { throw new Error('no body'); },
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

describe('fetchMonitoringEvents', () => {
  it('builds the URL with from/to/limit', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, { events: [] }));
    vi.stubGlobal('fetch', fetchMock);

    await fetchMonitoringEvents(1000, 2000, 50);
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain('/monitoring/events?');
    expect(url).toContain('from=1000');
    expect(url).toContain('to=2000');
    expect(url).toContain('limit=50');
  });

  it('omits limit when not given', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, { events: [] }));
    vi.stubGlobal('fetch', fetchMock);

    await fetchMonitoringEvents(1000, 2000);
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).not.toContain('limit=');
  });

  it('resolves the events array on a 2xx response, detail already null passes through', async () => {
    const events = [{ id: 1, t: 1000, kind: 'app-open', label: 'Calculator', detail: null, custom: false }];
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, { events })));

    expect(await fetchMonitoringEvents(0, 2000)).toEqual(events);
  });

  it('normalises a stored event with no detail key at all to detail: null', async () => {
    const wire = [{ id: 1, t: 1000, kind: 'custom', label: 'no detail key', custom: true }];
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, { events: wire })));

    const result = await fetchMonitoringEvents(0, 2000);
    expect(result[0].detail).toBeNull();
  });

  it('falls back to contract-shaped mock data when the route 404s (dev only)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(404, { error: true, msg: 'not_found' })));

    const now = Date.now();
    const result = await fetchMonitoringEvents(now - 3 * 3_600_000, now);
    expect(result.length).toBeGreaterThan(0);
  });

  it('throws on a 500 - a real error is not masked as an empty result', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(500, { error: true, msg: 'server_error' })));

    await expect(fetchMonitoringEvents(0, 1000)).rejects.toThrow();
  });

  it('throws when the service is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down'); }));

    await expect(fetchMonitoringEvents(0, 1000)).rejects.toThrow();
  });
});

describe('createCustomEvent', () => {
  it('posts t and label', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(201, { event: { id: 3, t: 5000, kind: 'custom', label: 'Started the render', custom: true } }));
    vi.stubGlobal('fetch', fetchMock);

    await createCustomEvent(5000, 'Started the render');
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ t: 5000, label: 'Started the render' });
  });

  it('normalises the POST response missing the detail key to detail: null', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(201, { event: { id: 3, t: 5000, kind: 'custom', label: 'no detail key', custom: true } })));

    const event = await createCustomEvent(5000, 'no detail key');
    expect(event.detail).toBeNull();
  });

  it('falls back to mock data on a 404 (dev only)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(404, { error: true, msg: 'not_found' })));

    const event = await createCustomEvent(5000, 'mocked label');
    expect(event.custom).toBe(true);
    expect(event.label).toBe('mocked label');
  });

  it('throws on a 400 (blank label rejected server-side)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(400, { error: true, msg: 'label required' })));

    await expect(createCustomEvent(5000, '')).rejects.toThrow();
  });
});

describe('deleteCustomEvent', () => {
  it('resolves on a 204', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => emptyResponse(204)));

    await expect(deleteCustomEvent(3)).resolves.toBeUndefined();
  });

  it('sends a DELETE to /monitoring/events/{id}', async () => {
    const fetchMock = vi.fn(async () => emptyResponse(204));
    vi.stubGlobal('fetch', fetchMock);

    await deleteCustomEvent(7);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/monitoring/events/7');
    expect(init.method).toBe('DELETE');
  });

  it('throws on a 400 (id is not a custom event)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(400, { error: true, msg: 'not_custom' })));

    await expect(deleteCustomEvent(1)).rejects.toThrow();
  });

  it('throws on a 404 with no matching id anywhere (including the dev mock store)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(404, { error: true, msg: 'not_found' })));

    await expect(deleteCustomEvent(999999)).rejects.toThrow();
  });

  it('resolves when a 404 matches a mock-created custom event by id (dev round trip)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(404, { error: true, msg: 'not_found' })));

    const created = await createCustomEvent(5000, 'to be removed');
    await expect(deleteCustomEvent(created.id)).resolves.toBeUndefined();
  });
});
