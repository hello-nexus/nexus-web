import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClearDataModal } from './ClearDataModal';
import { addDays, todayIso } from './clearDataRange';
import { deleteScreenTimeAll, deleteScreenTimeRange } from '../../../hooks/useScreenTimeBrowse';
import { deleteFpsAll, deleteFpsRange } from '../../../api/fps';
import { deleteMonitoringHistory } from '../../../api/monitoringHistory';

vi.mock('../../../hooks/useScreenTimeBrowse', () => ({
  deleteScreenTimeAll: vi.fn(),
  deleteScreenTimeRange: vi.fn(),
}));

vi.mock('../../../api/fps', () => ({
  deleteFpsAll: vi.fn(),
  deleteFpsRange: vi.fn(),
}));

vi.mock('../../../api/monitoringHistory', () => ({
  deleteMonitoringHistory: vi.fn(),
}));

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

// Swaps the real calendar popup for a plain date input, so a custom-range
// test can just set a value instead of driving the popup's day grid.
vi.mock('../../common/DatePicker/DatePicker', () => ({
  DatePicker: ({ value, onChange, ariaLabel }: { value: string; onChange: (v: string) => void; ariaLabel?: string }) => (
    <input type="date" value={value} aria-label={ariaLabel} onChange={e => onChange(e.target.value)} />
  ),
}));

const CONFIRM_NAME = 'settings.localDataStore.clearDataModal.confirmButton';
const TODAY = todayIso();

function selectPreset(labelKey: string) {
  fireEvent.click(screen.getByRole('radio', { name: `settings.localDataStore.clearDataModal.${labelKey}` }));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(deleteScreenTimeAll).mockResolvedValue({ deleted: 3 });
  vi.mocked(deleteScreenTimeRange).mockResolvedValue({ deleted: 5 });
  vi.mocked(deleteFpsAll).mockResolvedValue({ deleted: 7 });
  vi.mocked(deleteFpsRange).mockResolvedValue({ deleted: 9 });
  vi.mocked(deleteMonitoringHistory).mockResolvedValue({ deleted: 2 });
});

describe('ClearDataModal - screen time scope', () => {
  it('defaults to Today and deletes a single-day range', async () => {
    const onCleared = vi.fn();
    render(<ClearDataModal scope="screenTime" open onClose={vi.fn()} onCleared={onCleared} />);

    fireEvent.click(screen.getByRole('button', { name: CONFIRM_NAME }));

    await waitFor(() => expect(deleteScreenTimeRange).toHaveBeenCalledWith(TODAY, TODAY));
    expect(deleteScreenTimeAll).not.toHaveBeenCalled();
    await waitFor(() => expect(onCleared).toHaveBeenCalledWith(5));
  });

  it('last7Days deletes the trailing 7-day range ending today', async () => {
    render(<ClearDataModal scope="screenTime" open onClose={vi.fn()} onCleared={vi.fn()} />);

    selectPreset('last7Days');
    fireEvent.click(screen.getByRole('button', { name: CONFIRM_NAME }));

    await waitFor(() => expect(deleteScreenTimeRange).toHaveBeenCalledWith(addDays(TODAY, -6), TODAY));
  });

  it('last30Days deletes the trailing 30-day range ending today', async () => {
    render(<ClearDataModal scope="screenTime" open onClose={vi.fn()} onCleared={vi.fn()} />);

    selectPreset('last30Days');
    fireEvent.click(screen.getByRole('button', { name: CONFIRM_NAME }));

    await waitFor(() => expect(deleteScreenTimeRange).toHaveBeenCalledWith(addDays(TODAY, -29), TODAY));
  });

  it('custom range deletes exactly the picked from/to dates', async () => {
    render(<ClearDataModal scope="screenTime" open onClose={vi.fn()} onCleared={vi.fn()} />);

    selectPreset('custom');
    fireEvent.change(screen.getByLabelText('settings.localDataStore.clearDataModal.customFrom'), {
      target: { value: '2026-01-01' },
    });
    fireEvent.change(screen.getByLabelText('settings.localDataStore.clearDataModal.customTo'), {
      target: { value: '2026-01-15' },
    });
    fireEvent.click(screen.getByRole('button', { name: CONFIRM_NAME }));

    await waitFor(() => expect(deleteScreenTimeRange).toHaveBeenCalledWith('2026-01-01', '2026-01-15'));
  });

  it('all time calls the all-time delete instead of a ranged one', async () => {
    render(<ClearDataModal scope="screenTime" open onClose={vi.fn()} onCleared={vi.fn()} />);

    selectPreset('allTime');
    fireEvent.click(screen.getByRole('button', { name: CONFIRM_NAME }));

    await waitFor(() => expect(deleteScreenTimeAll).toHaveBeenCalled());
    expect(deleteScreenTimeRange).not.toHaveBeenCalled();
  });
});

describe('ClearDataModal - fps scope', () => {
  it('deletes the default Today range through the FPS range endpoint', async () => {
    render(<ClearDataModal scope="fps" open onClose={vi.fn()} onCleared={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: CONFIRM_NAME }));

    await waitFor(() => expect(deleteFpsRange).toHaveBeenCalledWith(TODAY, TODAY));
  });

  it('all time calls the FPS all-time delete', async () => {
    const onCleared = vi.fn();
    render(<ClearDataModal scope="fps" open onClose={vi.fn()} onCleared={onCleared} />);

    selectPreset('allTime');
    fireEvent.click(screen.getByRole('button', { name: CONFIRM_NAME }));

    await waitFor(() => expect(deleteFpsAll).toHaveBeenCalled());
    expect(deleteFpsRange).not.toHaveBeenCalled();
    await waitFor(() => expect(onCleared).toHaveBeenCalledWith(7));
  });
});

describe('ClearDataModal - monitoring history scope', () => {
  it('offers no preset picker, only the all-time clear', async () => {
    const onCleared = vi.fn();
    render(<ClearDataModal scope="monitoringHistory" open onClose={vi.fn()} onCleared={onCleared} />);

    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
    expect(screen.getByText('settings.localDataStore.clearDataModal.monitoringHistoryHint')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: CONFIRM_NAME }));

    await waitFor(() => expect(deleteMonitoringHistory).toHaveBeenCalled());
    await waitFor(() => expect(onCleared).toHaveBeenCalledWith(2));
  });
});

describe('ClearDataModal - cancel and loading', () => {
  it('cancel closes without deleting anything', () => {
    const onClose = vi.fn();
    render(<ClearDataModal scope="screenTime" open onClose={onClose} onCleared={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'confirm.cancel' }));

    expect(onClose).toHaveBeenCalled();
    expect(deleteScreenTimeAll).not.toHaveBeenCalled();
    expect(deleteScreenTimeRange).not.toHaveBeenCalled();
  });

  it('disables the confirm button while the delete request is in flight', async () => {
    let resolveDelete: ((v: { deleted: number }) => void) | null = null;
    vi.mocked(deleteScreenTimeRange).mockReturnValue(new Promise(resolve => { resolveDelete = resolve; }));
    const onCleared = vi.fn();
    render(<ClearDataModal scope="screenTime" open onClose={vi.fn()} onCleared={onCleared} />);

    const confirmButton = screen.getByRole('button', { name: CONFIRM_NAME });
    fireEvent.click(confirmButton);

    await waitFor(() => expect(confirmButton).toBeDisabled());
    expect(onCleared).not.toHaveBeenCalled();

    resolveDelete!({ deleted: 5 });
    await waitFor(() => expect(onCleared).toHaveBeenCalledWith(5));
  });

  it('ignores cancel while a delete request is in flight', async () => {
    vi.mocked(deleteScreenTimeAll).mockReturnValue(new Promise(() => {}));
    const onClose = vi.fn();
    render(<ClearDataModal scope="screenTime" open onClose={onClose} onCleared={vi.fn()} />);

    selectPreset('allTime');
    fireEvent.click(screen.getByRole('button', { name: CONFIRM_NAME }));
    await waitFor(() => expect(deleteScreenTimeAll).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: 'confirm.cancel' }));

    expect(onClose).not.toHaveBeenCalled();
  });

  it('does not report a stale result after the modal unmounts mid-request', async () => {
    let resolveDelete: ((v: { deleted: number }) => void) | null = null;
    vi.mocked(deleteScreenTimeAll).mockReturnValue(new Promise(resolve => { resolveDelete = resolve; }));
    const onCleared = vi.fn();
    const { unmount } = render(<ClearDataModal scope="screenTime" open onClose={vi.fn()} onCleared={onCleared} />);

    selectPreset('allTime');
    fireEvent.click(screen.getByRole('button', { name: CONFIRM_NAME }));
    await waitFor(() => expect(deleteScreenTimeAll).toHaveBeenCalled());

    unmount();
    resolveDelete!({ deleted: 3 });
    await Promise.resolve();

    expect(onCleared).not.toHaveBeenCalled();
  });
});
