import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { waitForPairApproval, PAIR_APPROVAL_POLL_MS } from './pairApproval';
import type { PanelPhonePairCodeConfirmResponse } from './panel';

type Resp = PanelPhonePairCodeConfirmResponse | null;

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

function sequence(...responses: Resp[]) {
  const fn = vi.fn<(id: string) => Promise<Resp>>(async () => responses.shift() ?? { status: 'waiting-host' });
  return fn;
}

describe('waitForPairApproval', () => {
  it('polls at 1 Hz while the host is deciding, then returns the token', async () => {
    const confirm = sequence(
      { status: 'waiting-host' },
      { status: 'waiting-host' },
      { status: 'approved', token: 'tok', machineName: 'PC', spkiFingerprint: 'fp' },
    );
    const p = waitForPairApproval({ requestId: 'r1', confirm });
    await vi.advanceTimersByTimeAsync(PAIR_APPROVAL_POLL_MS * 2);
    await expect(p).resolves.toEqual({ kind: 'approved', token: 'tok', machineName: 'PC', spki: 'fp' });
    expect(confirm).toHaveBeenCalledTimes(3);
    expect(confirm).toHaveBeenCalledWith('r1');
  });

  it('reports denied', async () => {
    const p = waitForPairApproval({ requestId: 'r', confirm: sequence({ status: 'denied' }) });
    await expect(p).resolves.toEqual({ kind: 'denied' });
  });

  it('reports expired when the service says so', async () => {
    const p = waitForPairApproval({ requestId: 'r', confirm: sequence({ status: 'expired' }) });
    await expect(p).resolves.toEqual({ kind: 'expired' });
  });

  it('expires at the deadline when the host never answers, riding out transport failures', async () => {
    const confirm = sequence(null, null, null);
    const p = waitForPairApproval({ requestId: 'r', ttlMs: 2500, confirm });
    await vi.advanceTimersByTimeAsync(5000);
    await expect(p).resolves.toEqual({ kind: 'expired' });
  });

  it('counts the default TTL on the local clock from the start', async () => {
    const confirm = sequence();
    const p = waitForPairApproval({ requestId: 'r', confirm });
    await vi.advanceTimersByTimeAsync(61_000);
    await expect(p).resolves.toEqual({ kind: 'expired' });
  });

  it('stops without a result when aborted', async () => {
    const abort = new AbortController();
    const confirm = sequence();
    const p = waitForPairApproval({ requestId: 'r', confirm, signal: abort.signal });
    await vi.advanceTimersByTimeAsync(10);
    abort.abort();
    await vi.advanceTimersByTimeAsync(10);
    await expect(p).resolves.toEqual({ kind: 'aborted' });
  });

  it('tells the PC to drop the request once when aborted', async () => {
    const abort = new AbortController();
    const cancel = vi.fn(async () => null);
    const p = waitForPairApproval({ requestId: 'req-9', confirm: sequence(), cancel, signal: abort.signal });
    await vi.advanceTimersByTimeAsync(10);
    abort.abort();
    await vi.advanceTimersByTimeAsync(10);
    await expect(p).resolves.toEqual({ kind: 'aborted' });
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledWith('req-9');
  });

  it('does not cancel when the host decided', async () => {
    const cancel = vi.fn(async () => null);
    const p = waitForPairApproval({ requestId: 'r', confirm: sequence({ status: 'denied' }), cancel });
    await vi.advanceTimersByTimeAsync(10);
    await p;
    expect(cancel).not.toHaveBeenCalled();
  });
});
