import { describe, expect, it, vi } from 'vitest';
import { waitForServiceRestart } from './waitForRestart';

const OPTIONS = { intervalMs: 1000, timeoutMs: 10_000 };
// Sleeping advances a fake clock, so the wall-clock deadline is deterministic.
function clock() {
  let t = 0;
  return { sleep: async (ms: number) => { t += ms; }, now: () => t, advance: (ms: number) => { t += ms; } };
}
const run = (ping: () => Promise<{ initialized: boolean } | null>, cancelled: () => boolean = () => false) => {
  const c = clock();
  return waitForServiceRestart(ping, OPTIONS, c.sleep, cancelled, c.now);
};
const UP = { initialized: true };

describe('waitForServiceRestart', () => {
  it('resolves when the service goes down and comes back initialized', async () => {
    const ping = vi.fn()
      .mockResolvedValueOnce(UP)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(UP);
    expect(await run(ping)).toBe(true);
    expect(ping).toHaveBeenCalledTimes(4);
  });

  it('keeps waiting while the restarted service is not initialized yet', async () => {
    const ping = vi.fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ initialized: false })
      .mockResolvedValueOnce(UP);
    expect(await run(ping)).toBe(true);
    expect(ping).toHaveBeenCalledTimes(3);
  });

  it('reports false when the service is never seen down', async () => {
    const ping = vi.fn().mockResolvedValue(UP);
    expect(await run(ping)).toBe(false);
    expect(ping).toHaveBeenCalledTimes(10);
  });

  it('reports false when the service stays down', async () => {
    const ping = vi.fn().mockResolvedValue(null);
    expect(await run(ping)).toBe(false);
  });

  it('stops when cancelled', async () => {
    const ping = vi.fn().mockResolvedValue(null);
    await run(ping, () => true);
    expect(ping).not.toHaveBeenCalled();
  });

  it('spends its budget in wall-clock time, so slow pings cannot stretch it', async () => {
    const c = clock();
    const ping = vi.fn(async () => { c.advance(4000); return null; });
    const result = await waitForServiceRestart(ping, OPTIONS, c.sleep, () => false, c.now);
    expect(result).toBe(false);
    expect(ping).toHaveBeenCalledTimes(2);
  });
});
