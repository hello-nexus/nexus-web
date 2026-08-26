import { render, screen } from '@testing-library/react';
import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { MultiplexContext } from './useMultiplexSocket';
import { useConflictApps } from './useConflictApps';

vi.mock('../api/conflicts', () => ({
  fetchConflicts: async () => ([{ id: 'signalrgb', displayName: 'SignalRGB', category: 'lighting', processName: 'SignalRgb', pid: 1 }]),
}));

function Readout({ enabled }: { enabled: boolean }) {
  const { conflicts } = useConflictApps(enabled);
  return <div data-testid="n">{conflicts.length}</div>;
}

/**
 * useTopic resolves MultiplexContext from ABOVE its component. A subscription
 * placed in the component that RENDERS the provider gets the null default and
 * never receives a frame, so the list freezes at the REST seed - which is what
 * left End task spinning forever on the onboarding gate while the sidebar
 * modal, rendered inside the provider, cleared normally.
 */
describe('useConflictApps subscription scope', () => {
  it('takes live frames when mounted inside the provider', async () => {
    const listeners = new Map<string, ((raw: unknown) => void)[]>();
    const ctx = {
      subscribe: (topic: string, fn: (raw: unknown) => void) => {
        listeners.set(topic, [...(listeners.get(topic) ?? []), fn]);
      },
      unsubscribe: () => {},
    } as unknown as React.ContextType<typeof MultiplexContext>;

    await act(async () => {
      render(
        <MultiplexContext.Provider value={ctx}>
          <Readout enabled />
        </MultiplexContext.Provider>,
      );
    });
    expect(screen.getByTestId('n').textContent).toBe('1');

    // The watcher clears the app; the row must go with it.
    await act(async () => {
      for (const fn of listeners.get('conflicts') ?? []) fn({ conflicts: [] });
    });
    expect(screen.getByTestId('n').textContent).toBe('0');
  });

  it('is frozen at the seed with no provider above it', async () => {
    await act(async () => { render(<Readout enabled />); });

    // No context, so no frame can ever arrive: the seed is all there is. This
    // is the shape the onboarding gate must never be mounted in.
    expect(screen.getByTestId('n').textContent).toBe('1');
  });
});
