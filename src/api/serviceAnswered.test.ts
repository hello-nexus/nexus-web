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

import { fetchService, fetchServiceBlob, fetchServiceBlobWithStatus, setActiveTransport } from './service';
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

  it('does not stamp on a blob fetch, which the HTTP cache may answer', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })));
    await fetchService('/sentry');
    now += 60_000;
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Blob(['img']), { status: 200 })));
    expect(await fetchServiceBlob('/deck/images/abc')).not.toBeNull();
    expect((await fetchServiceBlobWithStatus('/shortcuts/icon?targetId=x')).status).toBe(200);
    expect(serviceAnsweredAt()).toBe(1_000_000);
  });
});
