// useLocale() reads the store's locale, which the host seeds at spawn and patches on a language switch.

import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { createStore, ContextProvider, type WidgetContextInit } from '../../../sdk/runtime/context';
import { useLocale } from '../../../sdk/runtime/hooks';

function mountWith(init: Partial<WidgetContextInit>) {
  const store = createStore({
    instanceId: 'i-1',
    widgetId: 'w-1',
    size: { width: 100, height: 100 },
    settings: {},
    local: {},
    api: { persistLocal: () => {}, dispatch: () => Promise.resolve(null) },
    ...init,
  });
  const seen: string[] = [];
  function Probe() {
    seen.push(useLocale());
    return null;
  }
  render(<ContextProvider store={store}><Probe /></ContextProvider>);
  return { store, seen };
}

afterEach(cleanup);

describe('useLocale', () => {
  it('reads the locale the host spawned the worker with', () => {
    expect(mountWith({ locale: 'pt-BR' }).seen.at(-1)).toBe('pt-BR');
  });

  it('defaults to English when the spawn context carries none', () => {
    expect(mountWith({}).seen.at(-1)).toBe('en');
  });

  it('re-renders with the new locale when the host pushes a switch', () => {
    const { store, seen } = mountWith({ locale: 'en' });
    act(() => store.update({ locale: 'zh-TW' }));
    expect(seen.at(-1)).toBe('zh-TW');
  });
});
