import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockPost = vi.fn();
vi.mock('./service', () => ({
  fetchService: vi.fn(),
  postService: (...args: unknown[]) => mockPost(...args),
  postServiceForm: vi.fn(),
  putService: vi.fn(),
  deleteService: vi.fn(),
  resolveHttp: vi.fn(),
}));
vi.mock('./auth', () => ({ getTokenSync: () => '' }));

import { restartLianLiWirelessController } from './lianli-wireless';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('restartLianLiWirelessController', () => {
  it('posts to the restart route and reports a started restart', async () => {
    mockPost.mockResolvedValue({ error: false, msg: 'Ok' });
    expect(await restartLianLiWirelessController()).toBe('started');
    expect(mockPost).toHaveBeenCalledWith('/devices/lianli-wireless/restart-controller', {});
  });

  it.each([
    ['Busy', 'busy'],
    ['HeldBack', 'heldBack'],
    ['Unavailable', 'unavailable'],
    ['Other', 'failed'],
  ])('maps the service result %s to %s', async (msg, expected) => {
    mockPost.mockResolvedValue({ error: true, msg });
    expect(await restartLianLiWirelessController()).toBe(expected);
  });

  it('reports an unreachable service as failed', async () => {
    mockPost.mockResolvedValue(null);
    expect(await restartLianLiWirelessController()).toBe('failed');
  });
});
