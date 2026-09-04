import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCloudAccounts } from './useCloudAccounts';
import type { MultiplexContextValue } from './useMultiplexSocket';

const fetchCloudAccounts = vi.fn();
vi.mock('../api/cloud', () => ({
  fetchCloudAccounts: () => fetchCloudAccounts(),
}));

function fakeMultiplex() {
  const listeners = new Map<string, Array<(data: unknown) => void>>();
  const ctx = {
    subscribe: vi.fn((topic: string, listener: (data: unknown) => void) => {
      listeners.set(topic, [...(listeners.get(topic) ?? []), listener]);
    }),
    unsubscribe: vi.fn((topic: string, listener: (data: unknown) => void) => {
      listeners.set(topic, (listeners.get(topic) ?? []).filter(l => l !== listener));
    }),
  } as unknown as MultiplexContextValue;
  const fire = (topic: string) => { for (const l of listeners.get(topic) ?? []) l({ revision: 1 }); };
  return { ctx, fire };
}

describe('useCloudAccounts push refresh', () => {
  beforeEach(() => {
    fetchCloudAccounts.mockReset();
  });

  it('refetches the active account when the service pushes cloud/accounts', async () => {
    fetchCloudAccounts
      .mockResolvedValueOnce({ accounts: [], activeAccountId: null })
      .mockResolvedValueOnce({ accounts: [{ accountId: 'acct-1', username: 'alpha' }], activeAccountId: 'acct-1' });
    const { ctx, fire } = fakeMultiplex();

    const { result, unmount } = renderHook(() => useCloudAccounts(true, ctx));
    await waitFor(() => expect(fetchCloudAccounts).toHaveBeenCalledTimes(1));
    expect(result.current.activeAccountId).toBeNull();
    expect(ctx.subscribe).toHaveBeenCalledWith('cloud/accounts', expect.any(Function));

    act(() => fire('cloud/accounts'));
    await waitFor(() => expect(result.current.activeAccountId).toBe('acct-1'));

    unmount();
    expect(ctx.unsubscribe).toHaveBeenCalledWith('cloud/accounts', expect.any(Function));
  });

  it('does not subscribe while disabled', async () => {
    const { ctx } = fakeMultiplex();
    renderHook(() => useCloudAccounts(false, ctx));
    expect(ctx.subscribe).not.toHaveBeenCalled();
    expect(fetchCloudAccounts).not.toHaveBeenCalled();
  });
});
