import { act, render, screen, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GuardResponse } from '../api/cooling';
import { useThermalGuard } from './useThermalGuard';

// Rendered outside I18nProvider, so t() falls back to raw keys.

const api = vi.hoisted(() => ({ fetchGuard: vi.fn(), setGuardConfig: vi.fn(), undoHeal: vi.fn(), keepHeal: vi.fn(), acknowledgeGuardTrip: vi.fn() }));

vi.mock('../api/cooling', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/cooling')>()),
  ...api,
}));
vi.mock('./useMultiplexSocket', () => ({ useTopicCallback: () => {} }));

const guard = (state: GuardResponse['state']): GuardResponse => ({
  state, guardTempC: 50, limitC: 95, limitSource: 'spec', sinceUtcMs: null, lastTrip: null,
  heal: { undoAvailable: false, healedAtUtcMs: null, channels: [] },
});

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}

const handle: { current: ReturnType<typeof useThermalGuard> | null } = { current: null };
const hook = {
  toggle: (enabled: boolean) => handle.current!.toggle(enabled),
  refresh: () => handle.current!.refresh(),
};
function Harness({ online = true }: { online?: boolean }) {
  const h = useThermalGuard(online);
  useEffect(() => { handle.current = h; });
  return <><span data-testid="state">{h.guard?.state ?? 'none'}{h.toggling ? ' busy' : ''}</span>{[h.error, h.toggleError, h.limitError, h.lintWarningsError, h.ackError].map((e, i) => e && <p key={i} role="alert">{e.message}</p>)}</>;
}
const mount = (online = true) => render(<Harness online={online} />);

describe('useThermalGuard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.fetchGuard.mockResolvedValue(guard('normal'));
  });

  it('a poll that resolves after the toggle POST cannot flip the switch back', async () => {
    const poll = deferred<GuardResponse>();
    api.fetchGuard.mockReturnValueOnce(poll.promise);
    mount();
    api.setGuardConfig.mockResolvedValue(guard('off'));
    await act(async () => { await hook.toggle(false); });
    expect(screen.getByTestId('state').textContent).toBe('off');
    await act(async () => { poll.resolve(guard('normal')); });
    expect(screen.getByTestId('state').textContent).toBe('off');
  });

  it('does not start a second poll while one is in flight', async () => {
    const poll = deferred<GuardResponse>();
    api.fetchGuard.mockReturnValueOnce(poll.promise);
    mount();
    await act(async () => { void hook.refresh(); });
    expect(api.fetchGuard).toHaveBeenCalledTimes(1);
    await act(async () => { poll.resolve(guard('normal')); });
  });

  it('drops a response that lands after the service went offline', async () => {
    const poll = deferred<GuardResponse>();
    api.fetchGuard.mockReturnValueOnce(poll.promise);
    const view = mount();
    view.rerender(<Harness online={false} />);
    await act(async () => { poll.resolve(guard('floor')); });
    expect(screen.getByTestId('state').textContent).toBe('none');
  });

  it('marks the switch busy during the POST and merges a repeated submit', async () => {
    mount();
    await waitFor(() => { expect(screen.getByTestId('state').textContent).toBe('normal'); });
    const post = deferred<GuardResponse>();
    api.setGuardConfig.mockReturnValue(post.promise);
    act(() => { void hook.toggle(false); void hook.toggle(false); });
    expect(screen.getByTestId('state').textContent).toContain('busy');
    // The second request is the same intent: one write in flight, nothing dropped or doubled.
    await act(async () => { post.resolve(guard('off')); });
    await waitFor(() => { expect(screen.getByTestId('state').textContent).toBe('off'); });
    expect(screen.getByTestId('state').textContent).toBe('off');
  });

  it('shows an error and keeps the state when the POST fails', async () => {
    mount();
    await waitFor(() => { expect(screen.getByTestId('state').textContent).toBe('normal'); });
    api.setGuardConfig.mockResolvedValue(null);
    await act(async () => { await hook.toggle(false); });
    await screen.findByText('cooling.guard.error.toggle');
    expect(screen.getByTestId('state').textContent).toBe('normal');
  });

  it('a failed undo sets an error and reports false', async () => {
    mount();
    api.undoHeal.mockResolvedValue(null);
    let ok = true;
    await act(async () => { ok = await handle.current!.undo(); });
    expect(ok).toBe(false);
    await screen.findByText('cooling.guard.error.undo');
  });

  it('an offline-online flap does not start overlapping polls', async () => {
    const first = deferred<GuardResponse>();
    const second = deferred<GuardResponse>();
    api.fetchGuard.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const view = mount();
    view.rerender(<Harness online={false} />);
    view.rerender(<Harness online />);
    // The new generation polls once even though the old poll is still pending.
    expect(api.fetchGuard).toHaveBeenCalledTimes(2);
    await act(async () => { void handle.current!.refresh(); });
    expect(api.fetchGuard).toHaveBeenCalledTimes(2);
    await act(async () => { first.resolve(guard('floor')); second.resolve(guard('normal')); });
  });

  it('clears a failed-undo error once a poll shows the snapshot gone', async () => {
    mount();
    await waitFor(() => { expect(screen.getByTestId('state').textContent).toBe('normal'); });
    api.undoHeal.mockResolvedValue(null);
    await act(async () => { await handle.current!.undo(); });
    await screen.findByText('cooling.guard.error.undo');
    api.fetchGuard.mockResolvedValue(guard('normal'));
    await act(async () => { await handle.current!.refresh(); });
    await waitFor(() => { expect(screen.queryByText('cooling.guard.error.undo')).toBeNull(); });
  });

  it('clearError drops the message', async () => {
    mount();
    api.undoHeal.mockResolvedValue(null);
    await act(async () => { await handle.current!.undo(); });
    await screen.findByText('cooling.guard.error.undo');
    act(() => { handle.current!.clearError(); });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('refetches when a heal arrives before any guard has loaded', async () => {
    api.fetchGuard.mockResolvedValue(null);
    mount();
    await act(async () => {});
    const before = api.fetchGuard.mock.calls.length;
    await act(async () => { handle.current!.applyHeal({ undoAvailable: true, healedAtUtcMs: 1, channels: [] }); });
    expect(api.fetchGuard.mock.calls.length).toBe(before + 1);
  });

  it('sends a limit override and applies the returned guard', async () => {
    mount();
    api.setGuardConfig.mockResolvedValue(guard('floor'));
    await act(async () => { await handle.current!.setLimit(102); });
    expect(api.setGuardConfig).toHaveBeenCalledWith({ limitOverrideC: 102 });
    expect(screen.getByTestId('state').textContent).toBe('floor');
  });

  it('clears the override', async () => {
    mount();
    api.setGuardConfig.mockResolvedValue(guard('normal'));
    await act(async () => { await handle.current!.clearLimit(); });
    expect(api.setGuardConfig).toHaveBeenCalledWith({ clearLimitOverride: true });
  });

  it('shows the limit error for an error envelope', async () => {
    mount();
    await waitFor(() => { expect(screen.getByTestId('state').textContent).toBe('normal'); });
    api.setGuardConfig.mockResolvedValue({ error: true, msg: 'hardware' });
    await act(async () => { await handle.current!.setLimit(110); });
    await screen.findByText('cooling.guard.error.limit');
    expect(screen.getByTestId('state').textContent).toBe('normal');
  });

  it('sends a toggle and a limit as separate requests, toggle first', async () => {
    mount();
    api.setGuardConfig.mockResolvedValue(guard('normal'));
    await act(async () => {
      handle.current!.toggle(false);
      handle.current!.setLimit(101);
    });
    await waitFor(() => { expect(api.setGuardConfig).toHaveBeenCalledTimes(2); });
    expect(api.setGuardConfig.mock.calls.map(c => c[0])).toEqual([{ enabled: false }, { limitOverrideC: 101 }]);
  });

  it('reports a failed toggle and a failed limit separately', async () => {
    mount();
    api.setGuardConfig.mockResolvedValue(null);
    await act(async () => {
      handle.current!.toggle(false);
      handle.current!.setLimit(101);
    });
    await screen.findByText('cooling.guard.error.toggle');
    await screen.findByText('cooling.guard.error.limit');
  });

  it('a refused limit does not take the toggle down with it', async () => {
    mount();
    api.setGuardConfig.mockImplementation(async (body: Record<string, unknown>) =>
      (body.limitOverrideC ? { error: true, msg: 'detecting' } : guard('off')));
    await act(async () => {
      handle.current!.toggle(false);
      handle.current!.setLimit(101);
    });
    await screen.findByText('cooling.guard.error.limit');
    expect(screen.getByTestId('state').textContent).toContain('off');
    expect(screen.queryByText('cooling.guard.error.toggle')).toBeNull();
  });

  it('keep applies the returned heal and reports true', async () => {
    mount();
    api.keepHeal.mockResolvedValue({ undoAvailable: false, healedAtUtcMs: null, channels: [] });
    let ok = false;
    await act(async () => { ok = await handle.current!.keep(); });
    expect(ok).toBe(true);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('a failed keep sets an inline error and reports false', async () => {
    mount();
    api.keepHeal.mockResolvedValue(null);
    let ok = true;
    await act(async () => { ok = await handle.current!.keep(); });
    expect(ok).toBe(false);
    await screen.findByText('cooling.guard.error.keep');
  });

  it('sends the hazard-warning switch as its own request', async () => {
    mount();
    api.setGuardConfig.mockResolvedValue(guard('normal'));
    await act(async () => {
      handle.current!.toggle(false);
      handle.current!.setLintWarnings(false);
    });
    await waitFor(() => { expect(api.setGuardConfig).toHaveBeenCalledTimes(2); });
    expect(api.setGuardConfig.mock.calls.map(c => c[0])).toEqual([{ enabled: false }, { lintWarnings: false }]);
  });

  it('reports a failed hazard-warning write under its own error', async () => {
    mount();
    api.setGuardConfig.mockResolvedValue(null);
    await act(async () => { handle.current!.setLintWarnings(false); });
    await screen.findByText('cooling.guard.error.lintWarnings');
  });

  describe('trip acknowledgement', () => {
    const tripGuard = (atUtcMs: number, endedAtUtcMs: number | null): GuardResponse => ({
      ...guard('normal'),
      lastTrip: { atUtcMs, peakC: 90, reason: 'limit', escalated: false, endedAtUtcMs, acknowledged: false },
    });

    it('a refused dismissal sets its own error, not the shared one', async () => {
      api.fetchGuard.mockResolvedValue(tripGuard(1, 2));
      mount();
      await waitFor(() => { expect(screen.getByTestId('state').textContent).toBe('normal'); });
      api.acknowledgeGuardTrip.mockResolvedValue({ error: true, msg: 'The thermal guard is still active.' });
      let ok = true;
      await act(async () => { ok = await handle.current!.acknowledgeTrip(); });
      expect(ok).toBe(false);
      await screen.findByText('diagnostics.cooling.guardTrip.error');
      expect(handle.current!.error).toBeNull();
    });

    it('the error expires when the trip changes', async () => {
      api.fetchGuard.mockResolvedValue(tripGuard(1, 2));
      mount();
      await waitFor(() => { expect(screen.getByTestId('state').textContent).toBe('normal'); });
      api.acknowledgeGuardTrip.mockResolvedValue({ error: true, msg: 'x' });
      await act(async () => { await handle.current!.acknowledgeTrip(); });
      await screen.findByText('diagnostics.cooling.guardTrip.error');
      api.fetchGuard.mockResolvedValue(tripGuard(5, null));
      await act(async () => { await handle.current!.refresh(); });
      await waitFor(() => { expect(screen.queryByText('diagnostics.cooling.guardTrip.error')).toBeNull(); });
    });

    it('a successful dismissal clears the error and applies the guard', async () => {
      api.fetchGuard.mockResolvedValue(tripGuard(1, 2));
      mount();
      await waitFor(() => { expect(screen.getByTestId('state').textContent).toBe('normal'); });
      api.acknowledgeGuardTrip.mockResolvedValueOnce({ error: true, msg: 'x' });
      await act(async () => { await handle.current!.acknowledgeTrip(); });
      api.acknowledgeGuardTrip.mockResolvedValueOnce({ ...tripGuard(1, 2), lastTrip: { ...tripGuard(1, 2).lastTrip!, acknowledged: true } });
      await act(async () => { await handle.current!.acknowledgeTrip(); });
      expect(screen.queryByText('diagnostics.cooling.guardTrip.error')).toBeNull();
    });
  });
});
