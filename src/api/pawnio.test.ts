import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchService = vi.fn();
const authFetchWithStatus = vi.fn();
vi.mock('./service', () => ({
  fetchService: (...args: unknown[]) => fetchService(...args),
  authFetchWithStatus: (...args: unknown[]) => authFetchWithStatus(...args),
}));

import { fetchPawnIoStatus, fixPawnIo, parsePawnIoStatus, restartPcForPawnIo } from './pawnio';

function reply(status: number, body: unknown) {
  return { response: { ok: status < 400, json: async () => body }, status };
}

beforeEach(() => { fetchService.mockReset(); authFetchWithStatus.mockReset(); });

describe('parsePawnIoStatus', () => {
  it('reads the contract body', () => {
    expect(parsePawnIoStatus({
      installed: true, open: false, state: 'blocked', errorCode: 577, fixAction: 'none', fixing: false,
    })).toEqual({ installed: true, open: false, state: 'blocked', errorCode: 577, fixAction: 'none', fixing: false });
  });

  it('treats a body from an older service (no state) as unknown', () => {
    expect(parsePawnIoStatus({ installed: false, open: false })).toBeNull();
  });

  it('treats an unknown state, an error envelope and non-objects as unknown', () => {
    expect(parsePawnIoStatus({ state: 'mystery' })).toBeNull();
    expect(parsePawnIoStatus({ error: true, msg: 'nope' })).toBeNull();
    expect(parsePawnIoStatus(null)).toBeNull();
    expect(parsePawnIoStatus('ok')).toBeNull();
  });
});

describe('fetchPawnIoStatus', () => {
  it('is null when the request fails (404 on macOS or an older service)', async () => {
    fetchService.mockResolvedValue(null);
    expect(await fetchPawnIoStatus()).toBeNull();
  });

  it('is null when the request throws', async () => {
    fetchService.mockRejectedValue(new Error('network'));
    expect(await fetchPawnIoStatus()).toBeNull();
  });
});

describe('fixPawnIo', () => {
  it('returns the status after the attempt', async () => {
    authFetchWithStatus.mockResolvedValue(reply(200, { installed: true, open: true, state: 'ok', errorCode: null, fixAction: 'none', fixing: false }));
    expect((await fixPawnIo()).kind).toBe('status');
  });

  it('tells a firmware-flash 409 from other failures', async () => {
    authFetchWithStatus.mockResolvedValue(reply(409, { error: true, msg: 'A firmware update is in progress; cannot fix the driver now.' }));
    expect(await fixPawnIo()).toEqual({ kind: 'flashing' });
    authFetchWithStatus.mockResolvedValue(reply(500, { error: true, msg: 'boom' }));
    expect(await fixPawnIo()).toEqual({ kind: 'failed' });
    authFetchWithStatus.mockResolvedValue({ response: null, status: 0 });
    expect(await fixPawnIo()).toEqual({ kind: 'failed' });
  });
});

describe('restartPcForPawnIo', () => {
  it('maps 202, the flash 409, and every other refusal', async () => {
    authFetchWithStatus.mockResolvedValue(reply(202, {}));
    expect(await restartPcForPawnIo()).toBe('ok');
    authFetchWithStatus.mockResolvedValue(reply(409, { error: true, msg: 'A firmware update is in progress; cannot restart now.' }));
    expect(await restartPcForPawnIo()).toBe('flashing');
    authFetchWithStatus.mockResolvedValue(reply(409, { error: true, msg: 'No restart is needed for the driver.' }));
    expect(await restartPcForPawnIo()).toBe('refused');
    authFetchWithStatus.mockResolvedValue({ response: null, status: 0 });
    expect(await restartPcForPawnIo()).toBe('refused');
  });
});
