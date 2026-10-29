import { describe, expect, it, vi } from 'vitest';
import { waitForServiceRestart } from './waitForRestart';

const OPTIONS = { intervalMs: 1000, graceMs: 3000, timeoutMs: 10_000 };
const sleep = () => Promise.resolve();

describe('waitForServiceRestart', () => {
  it('resolves when the service goes down and comes back', async () => {
    const ping = vi.fn()
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({});
    await waitForServiceRestart(ping, OPTIONS, sleep);
    expect(ping).toHaveBeenCalledTimes(4);
  });

  it('gives up waiting for a drop after the grace window', async () => {
    const ping = vi.fn().mockResolvedValue({});
    await waitForServiceRestart(ping, OPTIONS, sleep);
    expect(ping).toHaveBeenCalledTimes(3);
  });

  it('stops at the timeout while the service stays down', async () => {
    const ping = vi.fn().mockResolvedValue(null);
    await waitForServiceRestart(ping, OPTIONS, sleep);
    expect(ping).toHaveBeenCalledTimes(10);
  });

  it('stops when cancelled', async () => {
    const ping = vi.fn().mockResolvedValue(null);
    await waitForServiceRestart(ping, OPTIONS, sleep, () => true);
    expect(ping).not.toHaveBeenCalled();
  });
});
