import { beforeEach, describe, expect, it, vi } from 'vitest';

const service = vi.hoisted(() => ({
  fetchService: vi.fn(async () => null),
  postService: vi.fn(async () => null),
  deleteService: vi.fn(async () => null),
}));
vi.mock('./service', () => service);

import { clearDevSims, fetchDevSimEvents, startDevSim, stopDevSim } from './devSim';

describe('devSim api', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reads the catalog and the active list with a GET', async () => {
    await fetchDevSimEvents();
    expect(service.fetchService).toHaveBeenCalledWith('/dev/sim/events');
  });

  it('starts a sim with a POST to its id', async () => {
    await startDevSim('guard.limitTrip');
    expect(service.postService).toHaveBeenCalledWith('/dev/sim/events/guard.limitTrip', {});
    expect(service.deleteService).not.toHaveBeenCalled();
  });

  it('stops a sim with a DELETE to its id', async () => {
    await stopDevSim('health.fanStall');
    expect(service.deleteService).toHaveBeenCalledWith('/dev/sim/events/health.fanStall');
    expect(service.postService).not.toHaveBeenCalled();
  });

  it('encodes an id before putting it in the path', async () => {
    await startDevSim('weird id/with?chars');
    expect(service.postService).toHaveBeenCalledWith('/dev/sim/events/weird%20id%2Fwith%3Fchars', {});
    await stopDevSim('a#b');
    expect(service.deleteService).toHaveBeenCalledWith('/dev/sim/events/a%23b');
  });

  it('clears everything with a POST to /dev/sim/clear', async () => {
    await clearDevSims();
    expect(service.postService).toHaveBeenCalledWith('/dev/sim/clear', {});
    expect(service.deleteService).not.toHaveBeenCalled();
  });
});
