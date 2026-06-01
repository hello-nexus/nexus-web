import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Proves the service.ts fetch layer routes through the relay HTTP tunnel WHEN
// the active transport is the relay, and stays on direct window.fetch otherwise
// (the unchanged LAN path). relayHttp is mocked so this isolates the routing
// decision in service.ts from the tunnel crypto (covered in relayHttp.test.ts).

const relayFetchMock = vi.fn(async () => ({ status: 200, body: JSON.stringify({ via: 'relay' }), contentType: 'application/json' }));
vi.mock('./relayHttp', () => ({
  relayFetch: (...args: unknown[]) => relayFetchMock(...args),
  resetRelayHttpTunnel: () => {},
}));

vi.mock('./auth', () => ({
  getToken: vi.fn(async () => 'session-token'),
  handleUnauthorized: vi.fn(async () => ''),
}));

import { fetchService, postService, setActiveTransport } from './service';

beforeEach(() => {
  relayFetchMock.mockClear();
  setActiveTransport(null);
});

afterEach(() => {
  vi.unstubAllGlobals();
  setActiveTransport(null);
});

describe('service.ts transport routing', () => {
  it('routes fetchService through relayFetch when the transport is relay', async () => {
    const directFetch = vi.fn();
    vi.stubGlobal('fetch', directFetch);
    setActiveTransport('relay');

    const out = await fetchService<{ via: string }>('/panel/devices');

    expect(out).toEqual({ via: 'relay' });
    expect(directFetch).not.toHaveBeenCalled();
    expect(relayFetchMock).toHaveBeenCalledTimes(1);
    // (token, relayUrl, method, path, body, contentType)
    const call = relayFetchMock.mock.calls[0] as unknown[];
    expect(call[2]).toBe('GET');
    expect(call[3]).toBe('/panel/devices');
    expect(call[4]).toBeNull();
  });

  it('seals the JSON body + content type for a relay POST', async () => {
    vi.stubGlobal('fetch', vi.fn());
    setActiveTransport('relay');

    await postService('/panel/profile', { name: 'x' });

    const call = relayFetchMock.mock.calls[0] as unknown[];
    expect(call[2]).toBe('POST');
    expect(call[3]).toBe('/panel/profile');
    expect(call[4]).toBe(JSON.stringify({ name: 'x' }));
    expect(call[5]).toBe('application/json');
  });

  it('uses direct window.fetch on the LAN transport (relay untouched)', async () => {
    const directFetch = vi.fn(async () => new Response(JSON.stringify({ via: 'lan' }), { status: 200 }));
    vi.stubGlobal('fetch', directFetch);
    setActiveTransport('lan');

    const out = await fetchService<{ via: string }>('/panel/devices');

    expect(out).toEqual({ via: 'lan' });
    expect(directFetch).toHaveBeenCalledTimes(1);
    expect(relayFetchMock).not.toHaveBeenCalled();
  });

  it('returns null on a non-2xx relay response (same contract as LAN)', async () => {
    relayFetchMock.mockResolvedValueOnce({ status: 503, body: 'down', contentType: 'text/plain' });
    vi.stubGlobal('fetch', vi.fn());
    setActiveTransport('relay');

    const out = await fetchService('/panel/devices');
    expect(out).toBeNull();
  });
});
