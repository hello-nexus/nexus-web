// Integration coverage for the timeframe label vs usage tiles agreeing with
// each other (see the failure-log entry class: a plain hero-chart click, no
// drag, pins selectedFrameMs without ever flipping `following` - MonitoringPage
// wires onGraphClick straight to setClickedFrameMs, independent of the
// viewport reducer). ProcessDetailPanel.test.tsx mocks useProcessDetailUsage
// wholesale, which is right for unit-testing the label/tile composition, but
// cannot catch a bug in how the REAL hook is wired (its `enabled` argument) -
// this file uses the real hook, mocking only the underlying fetch client.
import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProcessDetailPanel, type ProcessDetailPanelProps } from './ProcessDetailPanel';
import type { UseMonitoringProcessInfoResult } from '../../../../hooks/useMonitoringProcessInfo';
import type { MetricHistoryAppsQuery, MetricHistoryAppsResponse } from '../../../../api/monitoringHistoryApps';

vi.mock('../../../../hooks/useProcessIcon', () => ({
  useProcessIcon: () => null,
}));

const infoMock = vi.fn<() => UseMonitoringProcessInfoResult>();
vi.mock('../../../../hooks/useMonitoringProcessInfo', () => ({
  useMonitoringProcessInfo: () => infoMock(),
}));

vi.mock('../../../../api/monitoringProcessActions', () => ({
  killMonitoringProcess: vi.fn(),
  openMonitoringProcessLocation: vi.fn(),
}));

vi.mock('../../../../components/common/Toast/Toast', () => ({
  useToastSafe: () => ({ push: vi.fn() }),
}));

const fetchMock = vi.fn<(query: MetricHistoryAppsQuery) => Promise<{ data: MetricHistoryAppsResponse | null; mocked: boolean; unsupported: boolean }>>();
vi.mock('../../../../api/monitoringHistoryApps', () => ({
  fetchMonitoringHistoryApps: (query: MetricHistoryAppsQuery) => fetchMock(query),
}));

const NOW = 10_000_000;
const MINUTE = 60_000;

function baseProps(over: Partial<ProcessDetailPanelProps> = {}): ProcessDetailPanelProps {
  return {
    onClose: vi.fn(),
    name: 'chrome.exe',
    live: { cpuPercent: 1 },
    appsWindow: undefined,
    valueFormat: (v: number) => `${v}%`,
    privacySessions: [],
    privacySupported: true,
    selectedFrameMs: NOW,
    following: true,
    historyFrom: NOW - 30 * MINUTE,
    historyTo: NOW,
    ...over,
  };
}

const flush = () => act(async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
});

beforeEach(() => {
  infoMock.mockReturnValue({ data: null, loading: true, error: false, mocked: false, supported: true });
  fetchMock.mockReset();
});

describe('ProcessDetailPanel usage tiles vs timeframe label (real useProcessDetailUsage)', () => {
  it('agrees with the label: pinned-while-following shows the fetched historical value, not the live prop', async () => {
    const pinnedFrameMs = NOW - 5 * MINUTE;
    // A distinct value per metric so each tile's own fetched value is
    // unambiguous - cpu is the one under test, the rest just need to render
    // without colliding text.
    const valueBySeries: Record<string, number> = { cpu: 42, memory: 4321, gpu: 15, vram: 987 };
    fetchMock.mockImplementation(async query => ({
      data: {
        supported: true,
        apps: [{
          name: 'chrome.exe', avg: valueBySeries[query.series], max: valueBySeries[query.series],
          points: [{ t: pinnedFrameMs, avg: valueBySeries[query.series] }],
        }],
      },
      mocked: false,
      unsupported: false,
    }));

    render(<ProcessDetailPanel {...baseProps({
      live: { cpuPercent: 1 },
      following: true,
      selectedFrameMs: pinnedFrameMs,
      historyTo: NOW,
    })} />);

    // The label must read "as of", not "Live", for this pinned-while-
    // following state.
    expect(screen.getByText('monitoring.processDetail.timeframe.asOf')).toBeInTheDocument();
    expect(screen.queryByText('monitoring.history.live')).toBeNull();

    // The fetch must actually fire (enabled must be true here, not gated off
    // by the raw `following` flag) and the tile must reflect ITS value (42%),
    // never the stale live prop (1%).
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await flush();
    await waitFor(() => expect(screen.getByText('42%')).toBeInTheDocument());
    expect(screen.queryByText('1%')).toBeNull();
  });

  it('does not fetch, and shows the live value, when genuinely live (no pin, following)', async () => {
    render(<ProcessDetailPanel {...baseProps({
      live: { cpuPercent: 7 },
      following: true,
      selectedFrameMs: NOW,
      historyTo: NOW,
    })} />);

    expect(screen.getByText('monitoring.history.live')).toBeInTheDocument();
    expect(screen.getByText('7%')).toBeInTheDocument();
    await flush();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
