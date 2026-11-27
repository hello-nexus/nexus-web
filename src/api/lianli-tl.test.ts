import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockPost = vi.fn();
vi.mock('./service', () => ({
  fetchService: vi.fn(),
  postService: (...args: unknown[]) => mockPost(...args),
  putService: vi.fn(),
}));

import { lianLiTlScreenApi } from './lianli-tl';

beforeEach(() => {
  vi.clearAllMocks();
  mockPost.mockResolvedValue({ error: false, msg: '' });
});

describe('lianli-tl screen api', () => {
  it('sends a screen frame rate cap, 0 for Off, and does not treat it as nothing to send', async () => {
    expect(await lianLiTlScreenApi.setSettings('S1', { fpsCap: 60 })).toBe(true);
    expect(mockPost).toHaveBeenLastCalledWith('/devices/lianli-tl/screen/settings', { serial: 'S1', fpsCap: 60 });
    await lianLiTlScreenApi.setSettings('S1', { fpsCap: 0 });
    expect(mockPost).toHaveBeenLastCalledWith('/devices/lianli-tl/screen/settings', { serial: 'S1', fpsCap: 0 });
  });

  it('still sends nothing for an empty patch', async () => {
    expect(await lianLiTlScreenApi.setSettings('S1', {})).toBe(true);
    expect(mockPost).not.toHaveBeenCalled();
  });
});
