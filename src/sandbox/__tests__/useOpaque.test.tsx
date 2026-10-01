// useOpaque() reports through the host's setOpaque only while true, hands the
// background back on false or unmount, and is a no-op on a host without it.

import { render, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createStore, ContextProvider, type WidgetHostApi } from '../../../sdk/runtime/context';
import { useOpaque } from '../../../sdk/runtime/hooks';

function Probe({ opaque }: { opaque: boolean }) {
  useOpaque(opaque);
  return null;
}

function storeWith(api: Partial<WidgetHostApi>) {
  return createStore({
    instanceId: 'i-1',
    widgetId: 'w-1',
    size: { width: 100, height: 100 },
    settings: {},
    local: {},
    api: { persistLocal: () => {}, dispatch: () => Promise.resolve(null), ...api },
  });
}

afterEach(cleanup);

describe('useOpaque', () => {
  it('reports true while opaque, false when it turns off and on unmount', () => {
    const setOpaque = vi.fn();
    const store = storeWith({ setOpaque });
    const r = render(<ContextProvider store={store}><Probe opaque={false} /></ContextProvider>);
    expect(setOpaque).not.toHaveBeenCalled();
    r.rerender(<ContextProvider store={store}><Probe opaque /></ContextProvider>);
    expect(setOpaque).toHaveBeenLastCalledWith(true);
    r.rerender(<ContextProvider store={store}><Probe opaque={false} /></ContextProvider>);
    expect(setOpaque).toHaveBeenLastCalledWith(false);
    r.rerender(<ContextProvider store={store}><Probe opaque /></ContextProvider>);
    r.unmount();
    expect(setOpaque).toHaveBeenLastCalledWith(false);
  });

  it('does nothing on a host without setOpaque', () => {
    const store = storeWith({});
    expect(() => render(<ContextProvider store={store}><Probe opaque /></ContextProvider>)).not.toThrow();
  });
});
