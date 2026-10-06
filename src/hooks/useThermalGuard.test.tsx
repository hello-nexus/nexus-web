import { act, render, screen, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GuardResponse } from '../api/cooling';
import { useThermalGuard } from './useThermalGuard';

// Rendered outside I18nProvider, so t() falls back to raw keys.

const api = vi.hoisted(() => ({ fetchGuard: vi.fn(), setGuardEnabled: vi.fn(), undoHeal: vi.fn() }));

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
  return <><span data-testid="state">{h.guard?.state ?? 'none'}{h.toggling ? ' busy' : ''}</span>{h.error && <p role="alert">{h.error}</p>}</>;
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
    api.setGuardEnabled.mockResolvedValue(guard('off'));
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

  it('marks the switch busy during the POST and blocks a second submit', async () => {
    mount();
    await waitFor(() => { expect(screen.getByTestId('state').textContent).toBe('normal'); });
    const post = deferred<GuardResponse>();
    api.setGuardEnabled.mockReturnValue(post.promise);
    act(() => { void hook.toggle(false); void hook.toggle(false); });
    expect(screen.getByTestId('state').textContent).toContain('busy');
    expect(api.setGuardEnabled).toHaveBeenCalledTimes(1);
    await act(async () => { post.resolve(guard('off')); });
    expect(screen.getByTestId('state').textContent).toBe('off');
  });

  it('shows an error and keeps the state when the POST fails', async () => {
    mount();
    await waitFor(() => { expect(screen.getByTestId('state').textContent).toBe('normal'); });
    api.setGuardEnabled.mockResolvedValue(null);
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
});
