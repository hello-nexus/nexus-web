// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The panel-device helpers fail closed on a remote origin (no localhost PC to
// reach) - except the detected-desktop case (forceLanMode), where the device
// page on my.hellonexus.com needs the record for its theme + background.

const serviceState = { forceLan: false, tunnelActive: false };
const relayWithStatusMock = vi.fn(async () => ({
  response: new Response(JSON.stringify({ id: 'dev-1' }), { status: 200 }),
  status: 200,
}));

vi.mock('./service', () => ({
  isTunnelActive: () => serviceState.tunnelActive,
  isRemoteOrigin: true,
  isForceLanMode: () => serviceState.forceLan,
  loopbackFetchInit: { targetAddressSpace: 'loopback' },
  relayRequestWithStatus: (...args: unknown[]) => relayWithStatusMock(...args),
  RELAY_BOOT_TIMEOUT_MS: 6000,
  resolveHttp: (path: string) => `http://localhost:9400${path}`,
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
  serviceState.forceLan = false;
  serviceState.tunnelActive = false;
  relayWithStatusMock.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('panel.ts device helpers on a remote origin', () => {
  it('fail closed without forceLanMode - no localhost fetch fires', async () => {
    const directFetch = vi.fn();
    vi.stubGlobal('fetch', directFetch);

    expect(await fetchPanelDeviceWithStatus('dev-1')).toEqual({ found: false, status: 0 });
    expect(await patchPanelDeviceWithStatus('dev-1', { displayName: 'x' })).toEqual({ ok: false, status: 0 });
    expect(await allocatePanelDeviceWithStatus({ surface: 'phone' })).toEqual({ ok: false, status: 0 });
    expect(directFetch).not.toHaveBeenCalled();
  });

  it('reach localhost in forceLanMode (desktop browser on the public website)', async () => {
    serviceState.forceLan = true;
    const directFetch = vi.fn(async () => new Response(JSON.stringify({ id: 'dev-1' }), { status: 200 }));
    vi.stubGlobal('fetch', directFetch);

    const result = await fetchPanelDeviceWithStatus('dev-1');

    expect(result).toEqual({ found: true, record: { id: 'dev-1' } });
    expect(directFetch).toHaveBeenCalledTimes(1);
    expect(String(directFetch.mock.calls[0][0])).toBe('http://localhost:9400/panel/devices/dev-1');
    // Cross-origin to the service: no cookies (the CORS reply carries no
    // Allow-Credentials, so an 'include' fetch is rejected) and the loopback
    // address space declared for Chromium's Local Network Access check.
    const init = directFetch.mock.calls[0][1] as RequestInit & { targetAddressSpace?: string };
    expect(init.credentials).toBe('same-origin');
    expect(init.targetAddressSpace).toBe('loopback');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer session-token');
  });

  it('keeps a live tunnel ahead of localhost even in forceLanMode', async () => {
    serviceState.forceLan = true;
    serviceState.tunnelActive = true;
    const directFetch = vi.fn();
    vi.stubGlobal('fetch', directFetch);

    const result = await fetchPanelDeviceWithStatus('dev-1');

    expect(result).toEqual({ found: true, record: { id: 'dev-1' } });
    expect(directFetch).not.toHaveBeenCalled();
    expect(relayWithStatusMock).toHaveBeenCalledTimes(1);
  });
});
