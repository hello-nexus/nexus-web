import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DiagnosticsDrive, DiagnosticsSmartResponse } from '../../../api/diagnostics';
import { fetchSmartPoll, SMART_POLL_CHOICES } from '../../../api/smartPoll';
import { StorageSection } from './StorageSection';

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string | number>) => {
      let text = key;
      if (params) for (const [k, v] of Object.entries(params)) text += ` ${k}=${v}`;
      return text;
    },
  }),
}));
vi.mock('../../../api/smartPoll', async importActual => ({
  ...(await importActual<typeof import('../../../api/smartPoll')>()),
  fetchSmartPoll: vi.fn(),
}));
vi.mock('../../../hooks/useMultiplexSocket', () => ({ useTopicCallback: () => {} }));

const update = vi.fn();
const ui = { smartPollSeconds: {} as Record<string, number>, smartPollDefaultSeconds: 30, smartPollPerDrive: false };
vi.mock('../../../hooks/useUiSettings', () => ({
  useUiSettings: () => ({ settings: ui, update }),
  useUnitPrefs: () => ({ monitoringTempUnit: 'c', numberFormat: 'dot', timeFormat: '24h', monitoringWholeNumbers: false, dateFormat: 'system' }),
  useIgnoredComponents: () => ({ isIgnored: () => false, toggle: vi.fn() }),
}));

const drive = (id: string, name: string): DiagnosticsDrive => ({
  id, name, serial: id, bus: 'nvme', sizeBytes: 1000, temperatureC: 40, powerOnHours: 10, powerCycles: 1,
  healthPercent: 99, status: 'good', statusReasons: [], attributes: [], nvme: null,
});
const data: DiagnosticsSmartResponse = { supported: true, drives: [drive('storage:a', 'Disk A'), drive('storage:b', 'Disk B')] };

beforeEach(() => {
  update.mockClear();
  ui.smartPollSeconds = {};
  ui.smartPollDefaultSeconds = 30;
  ui.smartPollPerDrive = false;
  vi.mocked(fetchSmartPoll).mockResolvedValue({
    defaultSeconds: 30, perDrive: false, choices: SMART_POLL_CHOICES,
    drives: [
      { id: '/nvme/0', name: 'Disk A', seconds: 1, usesDefault: true, rotational: false },
      { id: '/nvme/1', name: 'Disk B', seconds: 1, usesDefault: true, rotational: false },
    ],
  });
});

describe('StorageSection per-drive polling', () => {
  it('puts the drive name, chip and interval control above the container', async () => {
    render(<StorageSection data={data} loading={false} error={false} onRefresh={() => {}} />);
    const selects = await screen.findAllByRole('button', { name: /diagnostics.storage.poll.label/ });
    expect(selects).toHaveLength(2);
    const header = screen.getByText('Disk A').closest('[class*="sectionHeaderRow"]') as HTMLElement;
    expect(header).toContainElement(selects[0]);
    expect(header).toContainElement(screen.getAllByRole('switch', { name: 'diagnostics.monitor.label' })[0]);
    // The container below holds content only: the name is not repeated inside it.
    expect(header.nextElementSibling).not.toContainElement(screen.getByText('Disk A'));
  });

  it('labels the polling select with visible text in the drive header', async () => {
    render(<StorageSection data={data} loading={false} error={false} onRefresh={() => {}} />);
    const header = (await screen.findByText('Disk A')).closest('[class*="sectionHeaderRow"]') as HTMLElement;
    expect(within(header).getByText('diagnostics.storage.poll.label')).toBeInTheDocument();
  });

  it('shows the default entry with the shared interval while the drive follows it', async () => {
    render(<StorageSection data={data} loading={false} error={false} onRefresh={() => {}} />);
    const [first] = await screen.findAllByRole('button', { name: /diagnostics.storage.poll.label/ });
    expect(first).toHaveTextContent('diagnostics.storage.poll.default interval=settings.smartPoll.seconds count=30');
  });

  it('writes the override and keeps the other drive on the default', async () => {
    render(<StorageSection data={data} loading={false} error={false} onRefresh={() => {}} />);
    const [first] = await screen.findAllByRole('button', { name: /diagnostics.storage.poll.label/ });
    fireEvent.click(first);
    fireEvent.click(await screen.findByRole('option', { name: 'settings.smartPoll.never' }));
    expect(update).toHaveBeenCalledWith({
      smartPollSeconds: { '/nvme/0': 0, '/nvme/1': 30 },
      smartPollDefaultSeconds: 30,
      smartPollPerDrive: true,
    });
  });

  it('offers no control for a drive the poll list does not know', async () => {
    vi.mocked(fetchSmartPoll).mockResolvedValue({ defaultSeconds: 30, perDrive: false, choices: SMART_POLL_CHOICES, drives: [] });
    render(<StorageSection data={data} loading={false} error={false} onRefresh={() => {}} />);
    await waitFor(() => expect(fetchSmartPoll).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: /diagnostics.storage.poll.label/ })).toBeNull();
  });
});
