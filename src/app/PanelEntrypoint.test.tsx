import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PANEL_DEVICE_ID_KEY } from './panelRouting';

const allocateMock = vi.fn();
const patchMock = vi.fn();
const claimMock = vi.fn();
const storePhoneTokenMock = vi.fn();

vi.mock('../api/panel', () => ({
  allocatePanelDeviceWithStatus: (...args: unknown[]) => allocateMock(...args),
  patchPanelDeviceWithStatus: (...args: unknown[]) => patchMock(...args),
  claimPanelPhonePairing: (...args: unknown[]) => claimMock(...args),
}));

vi.mock('../api/auth', () => ({
  storePhoneToken: (...args: unknown[]) => storePhoneTokenMock(...args),
}));

// PanelApp + simulator + overlay drag in the whole panel tree; replace with
// sentinel divs so the test only exercises PanelEntrypoint's state machine.
vi.mock('../panel/PanelApp', () => ({
  default: ({ deviceId }: { deviceId: string }) => (
    <div data-testid="panel-app" data-device-id={deviceId} />
  ),
}));

vi.mock('../panel/embed/PanelSimulatorContent', () => ({
  PanelSimulatorContent: () => <div data-testid="panel-simulator" />,
}));

vi.mock('../overlay/OverlayShell', () => ({
  default: () => <div data-testid="overlay-shell" />,
}));

vi.mock('../hooks/useMultiplexSocket', () => ({
  MultiplexContext: { Provider: ({ children }: { children: React.ReactNode }) => <>{children}</> },
  useMultiplexConnection: () => null,
}));

vi.mock('../hooks/useUiSettings', () => ({
  UiSettingsProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('./monitoringBridge', () => ({
  useMonitoringStoreBridge: () => {},
}));

import { PanelEntrypoint } from './PanelEntrypoint';

const STALE_ID = 'STALE_DEVICE_ID';
const FRESH_ID = 'FRESH_DEVICE_ID';

beforeEach(() => {
  allocateMock.mockReset();
  patchMock.mockReset();
  claimMock.mockReset();
  storePhoneTokenMock.mockReset();
  // history.replaceState is called by finish(); spy so we can assert the
  // redirect to /panel/<id> happened without polluting jsdom navigation.
  vi.spyOn(window.history, 'replaceState').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  delete (window as { nexusNative?: unknown }).nexusNative;
});

describe('PanelEntrypoint allocate-or-recover', () => {
  it('reallocates when the cached device id 404s on the server', async () => {
    // HAR-captured repro: localStorage carries an id from a previous session
    // but the server has lost the record.
    localStorage.setItem(PANEL_DEVICE_ID_KEY, STALE_ID);
    patchMock.mockResolvedValueOnce({ ok: false, status: 404 });
    allocateMock.mockResolvedValueOnce({
      ok: true,
      record: { id: FRESH_ID },
    });

    render(
      <PanelEntrypoint
        initialDeviceId={null}
        isPhonePair={false}
        pairToken={null}
        pairDeviceId={null}
      />,
    );

    await waitFor(() => expect(allocateMock).toHaveBeenCalledTimes(1));
    expect(patchMock).toHaveBeenCalledWith(STALE_ID, expect.any(Object));
    await waitFor(() =>
      expect(screen.getByTestId('panel-app').getAttribute('data-device-id'))
        .toBe(FRESH_ID),
    );
    expect(localStorage.getItem(PANEL_DEVICE_ID_KEY)).toBe(FRESH_ID);
    expect(window.history.replaceState).toHaveBeenCalledWith(
      null,
      '',
      expect.stringContaining(`/panel/${FRESH_ID}`),
    );
  });

  it('keeps the cached device id when the patch verify succeeds', async () => {
    localStorage.setItem(PANEL_DEVICE_ID_KEY, STALE_ID);
    patchMock.mockResolvedValueOnce({
      ok: true,
      record: { id: STALE_ID },
    });

    render(
      <PanelEntrypoint
        initialDeviceId={null}
        isPhonePair={false}
        pairToken={null}
        pairDeviceId={null}
      />,
    );

    await waitFor(() => expect(patchMock).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByTestId('panel-app').getAttribute('data-device-id'))
        .toBe(STALE_ID),
    );
    expect(allocateMock).not.toHaveBeenCalled();
    expect(localStorage.getItem(PANEL_DEVICE_ID_KEY)).toBe(STALE_ID);
  });

  it('keeps the cached device id on a transient non-404 failure', async () => {
    // 401 / network blip must not burn the cached record; auto-reallocating
    // on every transient hiccup would churn device records.
    localStorage.setItem(PANEL_DEVICE_ID_KEY, STALE_ID);
    patchMock.mockResolvedValueOnce({ ok: false, status: 401 });

    render(
      <PanelEntrypoint
        initialDeviceId={null}
        isPhonePair={false}
        pairToken={null}
        pairDeviceId={null}
      />,
    );

    await waitFor(() => expect(patchMock).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByTestId('panel-app').getAttribute('data-device-id'))
        .toBe(STALE_ID),
    );
    expect(allocateMock).not.toHaveBeenCalled();
    expect(localStorage.getItem(PANEL_DEVICE_ID_KEY)).toBe(STALE_ID);
  });

  it('allocates fresh when nothing is cached', async () => {
    allocateMock.mockResolvedValueOnce({
      ok: true,
      record: { id: FRESH_ID },
    });

    render(
      <PanelEntrypoint
        initialDeviceId={null}
        isPhonePair={false}
        pairToken={null}
        pairDeviceId={null}
      />,
    );

    // Allocating state shows a bare spinner - no "Registering panel..." text.
    expect(screen.getByRole('img', { name: 'common.loading' })).toBeInTheDocument();
    expect(screen.queryByText(/registering/i)).toBeNull();

    await waitFor(() => expect(allocateMock).toHaveBeenCalledTimes(1));
    expect(patchMock).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.getByTestId('panel-app').getAttribute('data-device-id'))
        .toBe(FRESH_ID),
    );
    expect(localStorage.getItem(PANEL_DEVICE_ID_KEY)).toBe(FRESH_ID);
  });
});

describe('PanelEntrypoint failure gate', () => {
  it('offers a Find your computer escape and calls the native bridge', async () => {
    // Native wrapper present: the gate is otherwise a dead end inside the app.
    const findComputer = vi.fn();
    (window as { nexusNative?: { findComputer: () => void } }).nexusNative = { findComputer };
    allocateMock.mockResolvedValueOnce({ ok: false, status: 500 });

    render(
      <PanelEntrypoint
        initialDeviceId={null}
        isPhonePair={false}
        pairToken={null}
        pairDeviceId={null}
      />,
    );

    const button = await screen.findByRole('button', { name: 'panel.gate.findComputer' });
    fireEvent.click(button);
    expect(findComputer).toHaveBeenCalledTimes(1);
  });

  it('hides the Find your computer escape outside the native app', async () => {
    allocateMock.mockResolvedValueOnce({ ok: false, status: 500 });

    render(
      <PanelEntrypoint
        initialDeviceId={null}
        isPhonePair={false}
        pairToken={null}
        pairDeviceId={null}
      />,
    );

    await screen.findByRole('button', { name: 'panel.gate.retry' });
    expect(screen.queryByRole('button', { name: 'panel.gate.findComputer' })).toBeNull();
  });
});
