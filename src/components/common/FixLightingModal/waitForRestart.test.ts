import { describe, expect, it, vi } from 'vitest';
import { waitForServiceRestart } from './waitForRestart';

const OPTIONS = { intervalMs: 1000, timeoutMs: 10_000 };
const sleep = () => Promise.resolve();
const UP = { initialized: true };

describe('waitForServiceRestart', () => {
  it('resolves when the service goes down and comes back initialized', async () => {
    const ping = vi.fn()
      .mockResolvedValueOnce(UP)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(UP);
    expect(await waitForServiceRestart(ping, OPTIONS, sleep)).toBe(true);
    expect(ping).toHaveBeenCalledTimes(4);
  });

  it('keeps waiting while the restarted service is not initialized yet', async () => {
    const ping = vi.fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ initialized: false })
      .mockResolvedValueOnce(UP);
    expect(await waitForServiceRestart(ping, OPTIONS, sleep)).toBe(true);
    expect(ping).toHaveBeenCalledTimes(3);
  });

  it('reports false when the service is never seen down', async () => {
    const ping = vi.fn().mockResolvedValue(UP);
    expect(await waitForServiceRestart(ping, OPTIONS, sleep)).toBe(false);
    expect(ping).toHaveBeenCalledTimes(10);
  });

  it('reports false when the service stays down', async () => {
    const ping = vi.fn().mockResolvedValue(null);
    expect(await waitForServiceRestart(ping, OPTIONS, sleep)).toBe(false);
  });

  it('stops when cancelled', async () => {
    const ping = vi.fn().mockResolvedValue(null);
    await waitForServiceRestart(ping, OPTIONS, sleep, () => true);
    expect(ping).not.toHaveBeenCalled();
  });
});
