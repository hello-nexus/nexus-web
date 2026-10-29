import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./relayHttp', () => ({
  relayFetch: vi.fn(),
  resetRelayHttpTunnel: () => {},
}));

vi.mock('./auth', () => ({
  getToken: vi.fn(async () => 'session-token'),
  handleUnauthorized: vi.fn(async () => ''),
  hasSessionToken: vi.fn(() => true),
}));

import { authFetchWithStatus, fetchService, fetchServiceBlob, setActiveTransport } from './service';
import { fetchDeckImage } from './deckImages';
import { effectThumbnailPath } from './lighting';
import { serviceAnsweredAt } from '../lib/serviceLiveness';

let now = 0;

beforeEach(() => {
  now = 1_000_000;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  setActiveTransport('lan');
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  setActiveTransport(null);
});

describe('authFetchWithStatus keepalive', () => {
  it('hands keepalive to fetch so a pagehide request outlives the page', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    await authFetchWithStatus('/telemetry/client-errors', { method: 'POST', body: { errors: [] }, keepalive: true });
    expect((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].keepalive).toBe(true);
  });
});

describe('service sign of life', () => {
  it('stamps on a completed REST response whatever its status', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('busy', { status: 503 })));
    expect(await fetchService('/sentry')).toBeNull();
    expect(serviceAnsweredAt()).toBe(1_000_000);
  });

  it('does not stamp when the request never got an answer', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })));
    await fetchService('/sentry');
    now += 60_000;
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    await fetchService('/sentry');
    expect(serviceAnsweredAt()).toBe(1_000_000);
  });

  it('stamps on a lighting thumbnail blob fetch, which always revalidates over the network', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('img', { status: 200 })));
    expect(await fetchServiceBlob(effectThumbnailPath('rainbow', 0, 'abc'))).not.toBeNull();
    expect(serviceAnsweredAt()).toBe(1_000_000);
  });

  it('does not stamp on a deck image fetch, which the HTTP cache may answer', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })));
    await fetchService('/sentry');
    now += 60_000;
    vi.stubGlobal('fetch', vi.fn(async () => new Response('img', { status: 200 })));
    expect(await fetchDeckImage('abc')).not.toBeNull();
    expect(serviceAnsweredAt()).toBe(1_000_000);
  });
});
