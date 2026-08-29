import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalDataStoreSection } from './LocalDataStoreSection';
import { ToastProvider } from '../../common/Toast/Toast';
import { getFpsTrackingStatus, setFpsTrackingEnabled } from '../../../api/fps';
import { getTrackingStatus, setTrackingEnabled } from '../../../hooks/useScreenTimeBrowse';
import type { ClearDataScope } from './ClearDataModal';

vi.mock('../../../api/fps', () => ({
  getFpsTrackingStatus: vi.fn(),
  setFpsTrackingEnabled: vi.fn(),
}));

vi.mock('../../../hooks/useScreenTimeBrowse', () => ({
  getTrackingStatus: vi.fn(),
  setTrackingEnabled: vi.fn(),
}));

let lastModalProps: { scope: ClearDataScope; open: boolean } | null = null;
vi.mock('./ClearDataModal', () => ({
  ClearDataModal: (props: { scope: ClearDataScope; open: boolean }) => {
    lastModalProps = { scope: props.scope, open: props.open };
    return props.open ? <div data-testid="clear-data-modal" data-scope={props.scope} /> : null;
  },
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
  lastModalProps = null;
  vi.mocked(getTrackingStatus).mockResolvedValue({ enabled: true });
  vi.mocked(getFpsTrackingStatus).mockResolvedValue({ enabled: true });
  vi.mocked(setTrackingEnabled).mockResolvedValue({ enabled: false });
  vi.mocked(setFpsTrackingEnabled).mockResolvedValue({ enabled: false });
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

describe('LocalDataStoreSection - clear data buttons', () => {
  it('opens the screen-time clear data modal', async () => {
    renderSection();
    await screen.findByRole('switch', { name: 'settings.screentime.tracking' });

    const clearButtons = screen.getAllByRole('button', { name: 'settings.localDataStore.clearButton' });
    fireEvent.click(clearButtons[0]);

    expect(lastModalProps).toEqual({ scope: 'screenTime', open: true });
    expect(screen.getByTestId('clear-data-modal')).toHaveAttribute('data-scope', 'screenTime');
  });

  it('opens the FPS clear data modal', async () => {
    renderSection();
    await screen.findByRole('switch', { name: 'settings.localDataStore.fps.label' });

    const clearButtons = screen.getAllByRole('button', { name: 'settings.localDataStore.clearButton' });
    fireEvent.click(clearButtons[1]);

    expect(lastModalProps).toEqual({ scope: 'fps', open: true });
  });

  it('opens the monitoring history clear data modal', async () => {
    renderSection();
    await screen.findByRole('switch', { name: 'settings.localDataStore.fps.label' });

    const clearButtons = screen.getAllByRole('button', { name: 'settings.localDataStore.clearButton' });
    fireEvent.click(clearButtons[2]);

    expect(lastModalProps).toEqual({ scope: 'monitoringHistory', open: true });
  });
});

describe('LocalDataStoreSection - service offline state', () => {
  it('does not fetch tracking status and disables every control', async () => {
    renderSection(false);

    expect(getFpsTrackingStatus).not.toHaveBeenCalled();
    expect(getTrackingStatus).not.toHaveBeenCalled();
    // No toggle renders while the status is unknown (never fetched offline).
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();

    for (const button of screen.getAllByRole('button', { name: 'settings.localDataStore.clearButton' })) {
      expect(button).toBeDisabled();
    }
  });
});
