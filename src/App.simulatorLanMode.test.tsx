import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// The simulator iframe must repeat the dashboard's forceLanMode decision on
// the public website - see the comment on the simulator branch in App.tsx.

const setForceLanModeMock = vi.fn();
vi.mock('./api/service', () => ({
  isRemoteOrigin: true,
  setForceLanMode: (...args: unknown[]) => setForceLanModeMock(...args),
}));
vi.mock('./app/windowActions', () => ({
  isWindowsAppShell: () => false,
  isMacAppShell: () => false,
}));
vi.mock('./app/PanelEntrypoint', () => ({
  OverlayWrapper: () => null,
  PanelEntrypoint: () => <div data-testid="panel-entrypoint" />,
  PanelSimulatorWrapper: () => <div data-testid="panel-simulator" />,
}));
vi.mock('./app/Dashboard', () => ({ Dashboard: () => <div data-testid="dashboard" /> }));
vi.mock('./PairRedirect', () => ({ PairRedirect: () => null }));
vi.mock('./telemetry/reference/TelemetryReference', () => ({ TelemetryReference: () => null }));
vi.mock('./lib/i18n', () => ({ I18nProvider: ({ children }: { children: React.ReactNode }) => <>{children}</> }));

import App from './App';

describe('App: simulator iframe on the public website', () => {
  beforeEach(() => {
    setForceLanModeMock.mockClear();
    vi.stubEnv('PROD', true);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    window.history.pushState({}, '', '/');
  });

  it('mirrors the dashboard: forceLanMode on for /panel?simulator=1', () => {
    window.history.pushState({}, '', '/panel?simulator=1');
    render(<App />);
    expect(screen.getByTestId('panel-simulator')).toBeTruthy();
    expect(setForceLanModeMock).toHaveBeenCalledWith(true);
  });

  it('leaves the phone panel route relay-only', () => {
    window.history.pushState({}, '', '/panel/phone');
    render(<App />);
    expect(screen.getByTestId('panel-entrypoint')).toBeTruthy();
    expect(setForceLanModeMock).not.toHaveBeenCalled();
  });
});
