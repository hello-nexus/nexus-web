import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const reloadMarketplaceApps = vi.fn(() => Promise.resolve());
vi.mock('../widgets/marketplaceRegistry', () => ({
  reloadMarketplaceApps: () => reloadMarketplaceApps(),
}));

// Interpolation-aware t() so assertions can verify the frame's fields land.
vi.mock('../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string | number>) => {
      let text = key;
      if (params) for (const [k, v] of Object.entries(params)) text += ` ${k}=${v}`;
      return text;
    },
  }),
}));

import { AppAutoInstalledToasts } from './AppAutoInstalledToasts';
import { ToastProvider } from '../components/common/Toast/Toast';
import { MultiplexContext, type MultiplexContextValue } from '../hooks/useMultiplexSocket';
import { APP_AUTO_INSTALLED_TOPIC, type AppAutoInstalledFrame } from '../api/store';

function renderWithMultiplex() {
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

  const view = render(
    <MultiplexContext.Provider value={ctx}>
      <ToastProvider>
        <AppAutoInstalledToasts />
      </ToastProvider>
    </MultiplexContext.Provider>,
  );
  const emit = (frame: Partial<AppAutoInstalledFrame> | null) => {
    act(() => {
      for (const listener of listeners.get(APP_AUTO_INSTALLED_TOPIC) ?? []) listener(frame);
    });
  };
  return { ...view, emit };
}

describe('AppAutoInstalledToasts', () => {
  it('announces the app by name and reloads the registry so it resolves', () => {
    reloadMarketplaceApps.mockClear();
    const { emit } = renderWithMultiplex();
    emit({ revision: 1, appId: 'com.ibuypower.control', appName: 'iBUYPOWER', placed: false });

    expect(screen.getByText('store.autoInstalledTitle name=iBUYPOWER')).toBeTruthy();
    expect(screen.getByText('store.autoInstalledBody name=iBUYPOWER')).toBeTruthy();
    expect(reloadMarketplaceApps).toHaveBeenCalledTimes(1);
  });

  it('says so when the widget was also placed on the panel', () => {
    const { emit } = renderWithMultiplex();
    emit({ revision: 1, appId: 'com.hellonexus.ina', appName: 'Ina', placed: true });

    expect(screen.getByText('store.autoInstalledBodyPlaced name=Ina')).toBeTruthy();
  });

  // A frame missing its name must not render the literal "undefined".
  it('falls back to the app id when the name is absent', () => {
    const { emit } = renderWithMultiplex();
    emit({ revision: 1, appId: 'com.hellonexus.ina', placed: false });

    expect(screen.getByText('store.autoInstalledTitle name=com.hellonexus.ina')).toBeTruthy();
  });

  it('ignores a frame with no app id', () => {
    reloadMarketplaceApps.mockClear();
    const { emit } = renderWithMultiplex();
    emit(null);
    emit({ revision: 1, appId: '' });

    expect(screen.queryByText(/store\.autoInstalled/)).toBeNull();
    expect(reloadMarketplaceApps).not.toHaveBeenCalled();
  });
});
