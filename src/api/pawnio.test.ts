import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchService = vi.fn();
vi.mock('./service', () => ({
  fetchService: (...args: unknown[]) => fetchService(...args),
  postService: vi.fn(),
  authFetchWithStatus: vi.fn(),
}));

import { fetchPawnIoStatus, parsePawnIoStatus } from './pawnio';

beforeEach(() => { fetchService.mockReset(); });

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
