import { act, render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

const order: string[] = [];
let settleReload: ((reloaded: boolean) => void) | null = null;
const reloadMarketplaceApps = vi.fn(() => new Promise<boolean>(resolve => {
  order.push('reload');
  settleReload = resolve;
}));
vi.mock('../../widgets/marketplaceRegistry', () => ({
  reloadMarketplaceApps: () => reloadMarketplaceApps(),
}));

import { useAppsChangedSync } from './useAppsChangedSync';
import { MultiplexContext, type MultiplexContextValue } from '../../hooks/useMultiplexSocket';
import { APPS_CHANGED_TOPIC } from '../../api/store';

function renderHarness(refetch: () => void) {
  const listeners = new Map<string, Set<(data: unknown) => void>>();
  const ctx = {
    subscribe: (topic: string, listener: (data: unknown) => void) => {
      if (!listeners.has(topic)) listeners.set(topic, new Set());
      listeners.get(topic)!.add(listener);
    },
    unsubscribe: (topic: string, listener: (data: unknown) => void) => {
      listeners.get(topic)?.delete(listener);
    },
    connected: true,
    transport: 'lan',
  } as unknown as MultiplexContextValue;

  function Probe() {
    useAppsChangedSync(refetch);
    return null;
  }

  render(
    <MultiplexContext.Provider value={ctx}>
      <Probe />
    </MultiplexContext.Provider>,
  );
  const emit = () => act(() => {
    for (const listener of listeners.get(APPS_CHANGED_TOPIC) ?? []) listener({ revision: 1 });
  });
  return { emit };
}

describe('useAppsChangedSync', () => {
  beforeEach(() => { order.length = 0; settleReload = null; vi.clearAllMocks(); });

  // The record refetch must not overtake the registry reload: a layout
  // normalized against the older registry drops the placement it just gained.
  it('refetches the record only after the registry reload settles', async () => {
    const refetch = vi.fn(() => { order.push('refetch'); });
    const { emit } = renderHarness(refetch);

    emit();

    expect(reloadMarketplaceApps).toHaveBeenCalledTimes(1);
    expect(refetch).not.toHaveBeenCalled();

    await act(async () => { settleReload?.(true); });

    await waitFor(() => expect(refetch).toHaveBeenCalledTimes(1));
    expect(order).toEqual(['reload', 'refetch']);
  });

  // A failed reload leaves the registry predating the install, so refetching on
  // it reproduces the drop the hook exists to prevent.
  it('skips the refetch when the reload failed', async () => {
    const refetch = vi.fn();
    const { emit } = renderHarness(refetch);

    emit();
    await act(async () => { settleReload?.(false); });

    expect(refetch).not.toHaveBeenCalled();
  });

  it('does nothing until the topic fires', () => {
    const refetch = vi.fn();
    renderHarness(refetch);

    expect(refetch).not.toHaveBeenCalled();
  });
});
