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

// hasSessionToken gates the remote-origin eager-relay default. Controllable so
// the eager test can assert routing with NO setActiveTransport() call (the
// real-world race: the panel's first REST fires before the multiplex socket
// opens). Default true: a stored token is the common case for a paired panel.
const authState = { hasToken: true };
vi.mock('./auth', () => ({
  getToken: vi.fn(async () => 'session-token'),
  handleUnauthorized: vi.fn(async () => ''),
  hasSessionToken: vi.fn(() => authState.hasToken),
}));

import {
  fetchService,
  fetchServiceBlob,
  postService,
  postServiceForm,
  pingService,
  authFetchWithStatus,
  isRelayActive,
  isLanSealedActive,
  isLanSealedEligible,
  isDirectActive,
  isTunnelActive,
  setActiveTransport,
  setActiveHttpTunnel,
} from './service';
import { effectThumbnailPath } from './lighting';

beforeEach(() => {
  relayFetchMock.mockClear();
  authState.hasToken = true;
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

// authFetchWithStatus is the status-preserving sibling of authFetch, used by
// callers (profiles.ts) that need to branch on a non-2xx body instead of
// having it collapsed to null. It must follow the exact same transport
// routing as authFetch/fetchService/postService above - a caller that hits
// the local service (not api.hellonexus.com) must still tunnel off-LAN.
describe('service.ts authFetchWithStatus transport routing', () => {
  it('routes through relayFetch on the relay transport and preserves a non-2xx status', async () => {
    relayFetchMock.mockResolvedValueOnce({ status: 409, body: JSON.stringify({ error: true, msg: 'taken' }), contentType: 'application/json' });
    const directFetch = vi.fn();
    vi.stubGlobal('fetch', directFetch);
    setActiveTransport('relay');

    const { status, response } = await authFetchWithStatus('/profiles/create', { method: 'POST', body: { name: 'x' } });

    expect(status).toBe(409);
    expect(await response?.json()).toEqual({ error: true, msg: 'taken' });
    expect(directFetch).not.toHaveBeenCalled();
    const call = relayFetchMock.mock.calls[0] as unknown[];
    expect(call[2]).toBe('POST');
    expect(call[3]).toBe('/profiles/create');
    expect(call[4]).toBe(JSON.stringify({ name: 'x' }));
  });

  it('uses direct window.fetch on the LAN transport and preserves a non-2xx status', async () => {
    const directFetch = vi.fn(async () => new Response(JSON.stringify({ error: true, msg: 'taken' }), { status: 409 }));
    vi.stubGlobal('fetch', directFetch);
    setActiveTransport('lan');

    const { status, response } = await authFetchWithStatus('/profiles/create', { method: 'POST', body: { name: 'x' } });

    expect(status).toBe(409);
    expect(await response?.json()).toEqual({ error: true, msg: 'taken' });
    expect(relayFetchMock).not.toHaveBeenCalled();
  });

  it('returns status 0 on a remote origin with no usable relay yet', async () => {
    authState.hasToken = false;
    const directFetch = vi.fn();
    vi.stubGlobal('fetch', directFetch);
    // No setActiveTransport call and no token ⇒ neither the eager relay
    // default nor the LAN path is reachable on this remote-origin test surface.

    const { status, response } = await authFetchWithStatus('/profiles/create', { method: 'POST', body: { name: 'x' } });

    expect(status).toBe(0);
    expect(response).toBeNull();
    expect(directFetch).not.toHaveBeenCalled();
    expect(relayFetchMock).not.toHaveBeenCalled();
  });
});

// On a REMOTE origin (the vitest jsdom URL is http://localhost/ with no port,
// so isServedFromService is false ⇒ isRemoteOrigin is true) the fetch layer
// must default to the relay for the very first call - before useMultiplexSocket
// has published any transport (activeTransport === null) - as long as a session
// token exists. This is the core regression: those early calls used to hit
// http://localhost and fail (wrong host + mixed-content), surfacing a bogus
// "could not reach the service" overlay.
describe('service.ts eager relay on a remote origin', () => {
  it('routes REST via relayFetch with NO setActiveTransport and NO http://localhost fetch', async () => {
    const directFetch = vi.fn();
    vi.stubGlobal('fetch', directFetch);
    // Deliberately do NOT call setActiveTransport - activeTransport stays null.
    expect(isRelayActive()).toBe(true);

    const out = await fetchService<{ via: string }>('/panel/devices');

    expect(out).toEqual({ via: 'relay' });
    expect(directFetch).not.toHaveBeenCalled();
    expect(relayFetchMock).toHaveBeenCalledTimes(1);
    expect((relayFetchMock.mock.calls[0] as unknown[])[3]).toBe('/panel/devices');
  });

  it('does NOT eagerly use the relay when there is no session token yet', async () => {
    authState.hasToken = false;
    const directFetch = vi.fn(async () => new Response(JSON.stringify({ via: 'lan' }), { status: 200 }));
    vi.stubGlobal('fetch', directFetch);

    expect(isRelayActive()).toBe(false);
    await fetchService('/panel/devices');

    // No token ⇒ no relay; the call stays on the (direct) path, untouched.
    expect(relayFetchMock).not.toHaveBeenCalled();
  });

  it('an explicit LAN transport overrides the eager relay default', async () => {
    const directFetch = vi.fn(async () => new Response(JSON.stringify({ via: 'lan' }), { status: 200 }));
    vi.stubGlobal('fetch', directFetch);
    setActiveTransport('lan');

    expect(isRelayActive()).toBe(false);
    const out = await fetchService<{ via: string }>('/panel/devices');

    expect(out).toEqual({ via: 'lan' });
    expect(directFetch).toHaveBeenCalledTimes(1);
    expect(relayFetchMock).not.toHaveBeenCalled();
  });
});

// LAN sealed transport (Phase 2). When the live transport is 'lan-sealed' the
// fetch layer must tunnel REST through relayFetch exactly like the cloud relay,
// but point it at the LOCAL /secure-tunnel URL (not the cloud relay), so the
// token never crosses the LAN as a bearer. setActiveTransport('lan-sealed')
// drives effectiveTransport() directly, so these assert the routing decision
// independent of the origin (which the jsdom env fixes at module load).
describe('service.ts lan-sealed transport routing', () => {
  it('tunnels REST through relayFetch targeting /secure-tunnel under lan-sealed', async () => {
    const directFetch = vi.fn();
    vi.stubGlobal('fetch', directFetch);
    setActiveTransport('lan-sealed');

    expect(isTunnelActive()).toBe(true);
    expect(isLanSealedActive()).toBe(true);
    // It is NOT the cloud relay - the relay-specific indicator must stay off.
    expect(isRelayActive()).toBe(false);

    const out = await fetchService<{ via: string }>('/panel/devices');

    expect(out).toEqual({ via: 'relay' }); // mock body; proves it went through relayFetch
    expect(directFetch).not.toHaveBeenCalled();
    expect(relayFetchMock).toHaveBeenCalledTimes(1);
    // (token, url, method, path, body, contentType) - url is the LOCAL sealed tunnel.
    const call = relayFetchMock.mock.calls[0] as unknown[];
    expect(call[1]).toMatch(/\/secure-tunnel$/);
    expect(call[1]).not.toContain('hellonexus.com/relay');
    expect(call[3]).toBe('/panel/devices');
  });

  it('targets the cloud relay (not /secure-tunnel) under the relay transport', async () => {
    vi.stubGlobal('fetch', vi.fn());
    setActiveTransport('relay');

    await fetchService('/panel/devices');

    const call = relayFetchMock.mock.calls[0] as unknown[];
    expect(call[1]).not.toMatch(/\/secure-tunnel$/);
    expect(call[1]).toContain('/relay');
  });

  it('isLanSealedEligible is false on this (remote-origin) test surface', () => {
    // The jsdom URL is http://localhost/ ⇒ isRemoteOrigin true, isRemotePaired
    // false, so lan-sealed never auto-activates here regardless of the flag -
    // a remote origin is the cloud relay's domain, not the LAN sealed tunnel's.
    expect(isLanSealedEligible()).toBe(false);
  });
});

// WebRTC direct data-channel transport. Same tunnel-routing contract as relay
// (isTunnelActive() gates every authFetch-family caller before it can ever
// reach blockedLocalhostFetch's http://localhost fallback), but dispatched
// through activeHttpTunnel instead of relayFetch. base64ToArrayBuffer below
// mirrors the encoding a real RtcHttpTunnel/RelayHttpTunnel response carries.
function base64Of(bytes: number[]): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

describe('service.ts direct transport routing', () => {
  afterEach(() => setActiveHttpTunnel(null));

  it('routes fetchService (JSON REST) through the direct http tunnel, not relay or window.fetch', async () => {
    const directFetch = vi.fn();
    vi.stubGlobal('fetch', directFetch);
    const requestMock = vi.fn(async () => ({ status: 200, body: JSON.stringify({ via: 'direct' }), contentType: 'application/json', base64: false }));
    setActiveHttpTunnel({ request: requestMock });
    setActiveTransport('direct');

    expect(isDirectActive()).toBe(true);
    expect(isTunnelActive()).toBe(true);
    const out = await fetchService<{ via: string }>('/panel/devices');

    expect(out).toEqual({ via: 'direct' });
    expect(requestMock).toHaveBeenCalledTimes(1);
    expect(requestMock.mock.calls[0]).toEqual(['GET', '/panel/devices', null, null]);
    expect(directFetch).not.toHaveBeenCalled();
    expect(relayFetchMock).not.toHaveBeenCalled();
  });

  it('routes a binary/thumbnail fetchServiceBlob through the direct http tunnel and decodes it', async () => {
    const directFetch = vi.fn();
    vi.stubGlobal('fetch', directFetch);
    const requestMock = vi.fn(async () => ({ status: 200, body: base64Of([1, 2, 3, 4]), contentType: 'image/png', base64: true }));
    setActiveHttpTunnel({ request: requestMock });
    setActiveTransport('direct');

    const blob = await fetchServiceBlob('/effects/thumb?key=x');

    expect(blob).not.toBeNull();
    expect(blob!.type).toBe('image/png');
    expect(blob!.size).toBe(4);
    expect(new Uint8Array(await blob!.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3, 4]));
    expect(directFetch).not.toHaveBeenCalled();
  });

  it('routes the lighting widget thumbnail source (effectThumbnailPath) through the direct http tunnel', async () => {
    const requestMock = vi.fn(async () => ({ status: 200, body: base64Of([9, 9]), contentType: 'image/bmp', base64: true }));
    setActiveHttpTunnel({ request: requestMock });
    setActiveTransport('direct');

    const expectedPath = effectThumbnailPath('rainbow', 0, 'abc123');
    const blob = await fetchServiceBlob(expectedPath);

    expect(blob).not.toBeNull();
    expect(requestMock).toHaveBeenCalledTimes(1);
    const [, path] = requestMock.mock.calls[0] as [string, string];
    expect(path).toBe(expectedPath);
  });

  it('postServiceForm and pingService also never fall through to http://localhost under direct', async () => {
    const directFetch = vi.fn();
    vi.stubGlobal('fetch', directFetch);
    setActiveHttpTunnel({ request: vi.fn(async () => ({ status: 200, body: '{}', contentType: 'application/json', base64: false })) });
    setActiveTransport('direct');

    await pingService();
    expect(directFetch).not.toHaveBeenCalled();

    // Form uploads can't be tunneled at all (multipart body) - direct fails
    // closed exactly like relay, never falling through to a doomed LAN fetch.
    const form = new FormData();
    const out = await postServiceForm('/media/stage', form);
    expect(out).toBeNull();
    expect(directFetch).not.toHaveBeenCalled();
  });

  it('retries a GET over relay when the direct tunnel rejects it as too large for the data channel', async () => {
    const directFetch = vi.fn();
    vi.stubGlobal('fetch', directFetch);
    const requestMock = vi.fn(async () => ({ status: 413, body: '{"error":true,"msg":"response exceeds direct-channel cap"}', contentType: 'application/json', base64: false }));
    setActiveHttpTunnel({ request: requestMock });
    setActiveTransport('direct');

    const out = await fetchServiceBlob('/media/big-item/thumbnail');

    expect(requestMock).toHaveBeenCalledTimes(1);
    expect(relayFetchMock).toHaveBeenCalledTimes(1);
    expect((relayFetchMock.mock.calls[0] as unknown[])[2]).toBe('GET');
    expect(out).not.toBeNull(); // the relay mock's default 200 JSON body decodes to a (non-null) blob
    expect(directFetch).not.toHaveBeenCalled();
  });

  it('does NOT retry a mutating (non-GET) request over relay on a 413 - it may have already taken effect', async () => {
    const requestMock = vi.fn(async () => ({ status: 413, body: '{"error":true}', contentType: 'application/json', base64: false }));
    setActiveHttpTunnel({ request: requestMock });
    setActiveTransport('direct');

    const out = await postService('/media/commit', { name: 'x' });

    expect(requestMock).toHaveBeenCalledTimes(1);
    expect(relayFetchMock).not.toHaveBeenCalled();
    expect(out).toBeNull();
  });

  it('falls back to the relay tunnel transparently once activeHttpTunnel clears (a direct drop)', async () => {
    setActiveHttpTunnel(null);
    setActiveTransport('direct');

    expect(isDirectActive()).toBe(true); // transport is still 'direct'...
    const out = await fetchService<{ via: string }>('/panel/devices');

    // ...but with no registered tunnel, the request lands on relayFetch.
    expect(out).toEqual({ via: 'relay' });
    expect(relayFetchMock).toHaveBeenCalledTimes(1);
  });
});
