import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Proves the panel.ts *WithStatus helpers - which bypass authFetch to read the
// raw HTTP status - route over the relay (and never fire an http://localhost
// fetch) when isTunnelActive() is true. allocatePanelDeviceWithStatus is the
// exact call that surfaced the bogus "could not reach the service" overlay on a
// remote origin before this fix.

const serviceState = { tunnelActive: true };
const relayWithStatusMock = vi.fn(
  async (...args: unknown[]) => {
    void args;
    return {
      response: new Response(JSON.stringify({ id: 'dev-1', displayName: 'Phone' }), { status: 200 }),
      status: 200,
    };
  },
);

vi.mock('./service', () => ({
  isTunnelActive: () => serviceState.tunnelActive,
  // The "stays on LAN" case flips this false (service-served origin) so the
  // remote-origin fail-closed guard in panel.ts doesn't short-circuit it.
  isRemoteOrigin: false,
  relayRequestWithStatus: (...args: unknown[]) => relayWithStatusMock(...(args as [string, string, unknown?])),
  resolveHttp: (path: string) => `http://localhost:9400${path}`,
  // Unused by the relay path but imported by panel.ts.
  fetchService: vi.fn(),
  postService: vi.fn(),
  deleteService: vi.fn(),
}));

vi.mock('./auth', () => ({
  getToken: vi.fn(async () => 'session-token'),
  handleUnauthorized: vi.fn(async () => ''),
}));

import {
  allocatePanelDeviceWithStatus,
  fetchPanelDeviceWithStatus,
  patchPanelDeviceWithStatus,
} from './panel';

beforeEach(() => {
  serviceState.tunnelActive = true;
  relayWithStatusMock.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('panel.ts *WithStatus relay routing', () => {
  it('allocates a device over the relay, never via http://localhost', async () => {
    const directFetch = vi.fn();
    vi.stubGlobal('fetch', directFetch);

    const result = await allocatePanelDeviceWithStatus({ surface: 'phone' });

    expect(result).toEqual({ ok: true, record: { id: 'dev-1', displayName: 'Phone' } });
    expect(directFetch).not.toHaveBeenCalled();
    expect(relayWithStatusMock).toHaveBeenCalledTimes(1);
    const call = relayWithStatusMock.mock.calls[0];
    expect(call[0]).toBe('POST');
    expect(call[1]).toBe('/panel/devices');
  });

  it('patches a device over the relay, never via http://localhost', async () => {
    const directFetch = vi.fn();
    vi.stubGlobal('fetch', directFetch);

    const result = await patchPanelDeviceWithStatus('dev-1', { displayName: 'x' });

    expect(result).toEqual({ ok: true, record: { id: 'dev-1', displayName: 'Phone' } });
    expect(directFetch).not.toHaveBeenCalled();
    expect((relayWithStatusMock.mock.calls[0])[0]).toBe('POST');
    expect((relayWithStatusMock.mock.calls[0])[1]).toBe('/panel/devices/dev-1');
  });

  it('fetches a device over the relay, never via http://localhost', async () => {
    const directFetch = vi.fn();
    vi.stubGlobal('fetch', directFetch);

    const result = await fetchPanelDeviceWithStatus('dev-1');

    expect(result).toEqual({ found: true, record: { id: 'dev-1', displayName: 'Phone' } });
    expect(directFetch).not.toHaveBeenCalled();
    expect((relayWithStatusMock.mock.calls[0])[0]).toBe('GET');
    expect((relayWithStatusMock.mock.calls[0])[1]).toBe('/panel/devices/dev-1');
  });

  it('surfaces the relay HTTP status on a non-2xx (e.g. 403 over the relay)', async () => {
    relayWithStatusMock.mockResolvedValueOnce({ response: new Response('', { status: 403 }), status: 403 });
    vi.stubGlobal('fetch', vi.fn());

    const result = await allocatePanelDeviceWithStatus({ surface: 'phone' });
    expect(result).toEqual({ ok: false, status: 403 });
  });

  it('reports status 0 (transport failure) so the caller shows the genuine error', async () => {
    relayWithStatusMock.mockResolvedValueOnce({ response: null, status: 0 });
    vi.stubGlobal('fetch', vi.fn());

    const result = await allocatePanelDeviceWithStatus({ surface: 'phone' });
    expect(result).toEqual({ ok: false, status: 0 });
  });

  it('stays on the direct LAN path when the relay is not active', async () => {
    serviceState.tunnelActive = false;
    const directFetch = vi.fn(async () => new Response(JSON.stringify({ id: 'lan-dev' }), { status: 200 }));
    vi.stubGlobal('fetch', directFetch);

    await allocatePanelDeviceWithStatus({ surface: 'phone' });

    expect(directFetch).toHaveBeenCalledTimes(1);
    expect(relayWithStatusMock).not.toHaveBeenCalled();
  });
});
