import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalDataStoreSection } from './LocalDataStoreSection';
import { ToastProvider } from '../../common/Toast/Toast';
import { getFpsTrackingStatus, setFpsTrackingEnabled, deleteFpsAll } from '../../../api/fps';
import { deleteMonitoringHistory } from '../../../api/monitoringHistory';
import { getTrackingStatus, setTrackingEnabled, deleteScreenTimeAll } from '../../../hooks/useScreenTimeBrowse';

vi.mock('../../../api/fps', () => ({
  getFpsTrackingStatus: vi.fn(),
  setFpsTrackingEnabled: vi.fn(),
  deleteFpsAll: vi.fn(),
}));

vi.mock('../../../api/monitoringHistory', () => ({
  deleteMonitoringHistory: vi.fn(),
}));

vi.mock('../../../hooks/useScreenTimeBrowse', () => ({
  getTrackingStatus: vi.fn(),
  setTrackingEnabled: vi.fn(),
  deleteScreenTimeAll: vi.fn(),
}));

vi.mock('../ScreenTimeBrowse/ScreenTimeDataControl', () => ({
  ScreenTimeDataControl: () => null,
}));

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, string | number>) => (
      vars ? `${key}(${Object.entries(vars).map(([k, v]) => `${k}=${v}`).join(',')})` : key
    ),
  }),
}));

function renderSection(serviceOnline = true) {
  return render(
    <ToastProvider>
      <LocalDataStoreSection serviceOnline={serviceOnline} />
    </ToastProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getTrackingStatus).mockResolvedValue({ enabled: true });
  vi.mocked(getFpsTrackingStatus).mockResolvedValue({ enabled: true });
  vi.mocked(setTrackingEnabled).mockResolvedValue({ enabled: false });
  vi.mocked(setFpsTrackingEnabled).mockResolvedValue({ enabled: false });
  vi.mocked(deleteScreenTimeAll).mockResolvedValue({ deleted: 3 });
  vi.mocked(deleteFpsAll).mockResolvedValue({ deleted: 7 });
  vi.mocked(deleteMonitoringHistory).mockResolvedValue({ deleted: 2 });
});

describe('LocalDataStoreSection - toggle round trip', () => {
  it('loads and flips the FPS tracking toggle, applying the echoed value', async () => {
    renderSection();
    const toggle = await screen.findByRole('switch', { name: 'settings.localDataStore.fps.label' });
    expect(toggle).toHaveAttribute('aria-checked', 'true');

    fireEvent.click(toggle);

    expect(setFpsTrackingEnabled).toHaveBeenCalledWith(false);
    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'false'));
  });

  it('loads and flips the screen-time tracking toggle, applying the echoed value', async () => {
    renderSection();
    const toggle = await screen.findByRole('switch', { name: 'settings.screentime.tracking' });
    expect(toggle).toHaveAttribute('aria-checked', 'true');

    fireEvent.click(toggle);

    expect(setTrackingEnabled).toHaveBeenCalledWith(false);
    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'false'));
  });

  it('rolls back to the previous value when the server rejects the change', async () => {
    vi.mocked(setFpsTrackingEnabled).mockResolvedValue(null);
    renderSection();
    const toggle = await screen.findByRole('switch', { name: 'settings.localDataStore.fps.label' });

    fireEvent.click(toggle);

    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'true'));
  });

  it('ignores a second click while the first request is still in flight', async () => {
    let resolveRequest: ((v: { enabled: boolean }) => void) | null = null;
    vi.mocked(setFpsTrackingEnabled).mockReturnValue(new Promise(resolve => { resolveRequest = resolve; }));
    renderSection();
    const toggle = await screen.findByRole('switch', { name: 'settings.localDataStore.fps.label' });

    fireEvent.click(toggle);
    fireEvent.click(toggle);
    resolveRequest!({ enabled: false });
    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'false'));

    expect(setFpsTrackingEnabled).toHaveBeenCalledTimes(1);
  });
});

describe('LocalDataStoreSection - purge confirm flow', () => {
  it('purges FPS data after confirming and shows the deleted count', async () => {
    renderSection();
    await screen.findByRole('switch', { name: 'settings.localDataStore.fps.label' });

    // Three rows share the same button label - the FPS row is the second one.
    const purgeButtons = screen.getAllByRole('button', { name: 'settings.localDataStore.purgeButton' });
    fireEvent.click(purgeButtons[1]);

    const dialog = screen.getByRole('alertdialog', { name: 'settings.localDataStore.fps.purgeConfirmTitle' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'settings.localDataStore.purgeButton' }));

    await waitFor(() => expect(deleteFpsAll).toHaveBeenCalled());
    expect(await screen.findByText('settings.localDataStore.purgeDone(count=7)')).toBeInTheDocument();
  });

  it('purges monitoring history after confirming', async () => {
    renderSection();
    await screen.findByRole('switch', { name: 'settings.localDataStore.fps.label' });

    const purgeButtons = screen.getAllByRole('button', { name: 'settings.localDataStore.purgeButton' });
    fireEvent.click(purgeButtons[purgeButtons.length - 1]);

    const dialog = screen.getByRole('alertdialog', { name: 'settings.localDataStore.monitoringHistory.purgeConfirmTitle' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'settings.localDataStore.purgeButton' }));

    await waitFor(() => expect(deleteMonitoringHistory).toHaveBeenCalled());
    expect(await screen.findByText('settings.localDataStore.purgeDone(count=2)')).toBeInTheDocument();
  });

  it('does not purge when the confirm dialog is cancelled', async () => {
    renderSection();
    await screen.findByRole('switch', { name: 'settings.localDataStore.fps.label' });

    const purgeButtons = screen.getAllByRole('button', { name: 'settings.localDataStore.purgeButton' });
    fireEvent.click(purgeButtons[0]);
    const dialog = screen.getByRole('alertdialog', { name: 'settings.localDataStore.screenTime.purgeConfirmTitle' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'confirm.cancel' }));

    expect(deleteScreenTimeAll).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
});

describe('LocalDataStoreSection - service offline state', () => {
  it('does not fetch tracking status and disables every control', async () => {
    renderSection(false);

    expect(getFpsTrackingStatus).not.toHaveBeenCalled();
    expect(getTrackingStatus).not.toHaveBeenCalled();
    // No toggle renders while the status is unknown (never fetched offline).
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();

    for (const button of screen.getAllByRole('button', { name: 'settings.localDataStore.purgeButton' })) {
      expect(button).toBeDisabled();
    }
    expect(screen.getByRole('button', { name: 'settings.screentime.openButton' })).toBeDisabled();
  });
});
