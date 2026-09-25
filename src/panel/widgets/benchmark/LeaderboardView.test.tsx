import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getLeaderboardMock = vi.fn();
const getBenchmarkVersionsMock = vi.fn();
const getLastSubmissionIdMock = vi.fn();
vi.mock('../../../api/nexusApi', () => ({
  getLeaderboard: (...args: unknown[]) => getLeaderboardMock(...args),
  getBenchmarkVersions: (...args: unknown[]) => getBenchmarkVersionsMock(...args),
  getLastSubmissionId: (...args: unknown[]) => getLastSubmissionIdMock(...args),
}));

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string | number>) => {
      let text = key;
      if (params) for (const [k, v] of Object.entries(params)) text += ` ${k}=${v}`;
      return text;
    },
  }),
}));

import { LeaderboardView } from './LeaderboardView';

function mkEntry(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'entry-1',
    rank: 1,
    composite: 1500,
    displayName: null,
    createdAt: '2026-06-01T00:00:00Z',
    scoringVersion: 'v2.1-2026.06',
    cpu: { raw: 1, unit: 'x', score: 1 },
    gpu: { raw: 1, unit: 'x', score: 1 },
    ram: { raw: 1, unit: 'x', score: 1 },
    storage: { raw: 1, unit: 'x', score: 1 },
    hardware: { cpuModel: 'Ryzen 9', gpuModels: ['RTX 5090'], ramModel: 'DDR5', storageModel: 'NVMe', os: 'Windows 11', logicalCores: 16 },
    tools: {},
    ...overrides,
  };
}

beforeEach(() => {
  getLeaderboardMock.mockReset();
  getBenchmarkVersionsMock.mockReset();
  getLastSubmissionIdMock.mockReset().mockReturnValue(null);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('LeaderboardView', () => {
  it('hides the version selector when the versions endpoint errors', async () => {
    getBenchmarkVersionsMock.mockResolvedValue(null);
    getLeaderboardMock.mockResolvedValue({ total: 1, entries: [mkEntry()] });

    render(<LeaderboardView />);

    await waitFor(() => expect(screen.getByText('Ryzen 9')).toBeInTheDocument());
    expect(screen.queryByText('benchmark.leaderboard.filterVersion')).not.toBeInTheDocument();
  });

  it('hides the version selector when there are no versions with data', async () => {
    getBenchmarkVersionsMock.mockResolvedValue([]);
    getLeaderboardMock.mockResolvedValue({ total: 0, entries: [] });

    render(<LeaderboardView />);

    await waitFor(() => expect(screen.getByText('benchmark.leaderboard.empty')).toBeInTheDocument());
    expect(screen.queryByText('benchmark.leaderboard.filterVersion')).not.toBeInTheDocument();
  });

  it('shows the version selector populated from the versions endpoint', async () => {
    getBenchmarkVersionsMock.mockResolvedValue([
      { scoringVersion: 'v2.2-2026.07', count: 42 }, { scoringVersion: 'v2.1-2026.06', count: 10 },
    ]);
    getLeaderboardMock.mockResolvedValue({ total: 1, entries: [mkEntry()] });

    render(<LeaderboardView />);

    await waitFor(() => expect(screen.getByText('benchmark.leaderboard.filterVersion')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'benchmark.leaderboard.filterVersion' }));

    expect(await screen.findByRole('option', { name: 'v2.2-2026.07' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'v2.1-2026.06' })).toBeInTheDocument();
  });

  it('opens the entry page on click, with the owner linked to their public profile', async () => {
    getBenchmarkVersionsMock.mockResolvedValue(null);
    getLeaderboardMock.mockResolvedValue({ total: 1, entries: [mkEntry({ displayName: 'Nova' })] });

    render(<LeaderboardView />);

    // The row itself carries no nested links: the whole card opens the entry.
    const row = await screen.findByRole('button', { name: /Nova/ });
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    fireEvent.click(row);

    expect(await screen.findByText('DDR5')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'Nova' });
    expect(link).toHaveAttribute('href', 'https://build.hellonexus.com/u/Nova');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('returns to the list from the entry page', async () => {
    getBenchmarkVersionsMock.mockResolvedValue(null);
    getLeaderboardMock.mockResolvedValue({ total: 1, entries: [mkEntry()] });

    render(<LeaderboardView />);
    fireEvent.click(await screen.findByRole('button', { name: /Ryzen 9/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'benchmark.detail.back' }));

    expect(await screen.findByRole('button', { name: /Ryzen 9/ })).toBeInTheDocument();
    expect(screen.queryByText('DDR5')).not.toBeInTheDocument();
    expect(getLeaderboardMock).toHaveBeenCalledTimes(1);
  });

  it('requests one page at a time and pages through the total', async () => {
    getBenchmarkVersionsMock.mockResolvedValue(null);
    getLeaderboardMock.mockResolvedValue({ total: 120, entries: [mkEntry()] });

    render(<LeaderboardView />);

    await waitFor(() => expect(screen.getByText('common.pager.pageOf n=1 total=3')).toBeInTheDocument());
    expect(getLeaderboardMock).toHaveBeenLastCalledWith(expect.objectContaining({ limit: 50, offset: 0 }));

    fireEvent.click(screen.getByRole('button', { name: 'common.pager.next' }));

    await waitFor(() => expect(screen.getByText('common.pager.pageOf n=2 total=3')).toBeInTheDocument());
    expect(getLeaderboardMock).toHaveBeenLastCalledWith(expect.objectContaining({ limit: 50, offset: 50 }));
  });

  it('returns to the first page when the version filter changes', async () => {
    getBenchmarkVersionsMock.mockResolvedValue([{ scoringVersion: 'v2.2-2026.07', count: 120 }]);
    getLeaderboardMock.mockResolvedValue({ total: 120, entries: [mkEntry()] });

    render(<LeaderboardView />);
    fireEvent.click(await screen.findByRole('button', { name: 'common.pager.next' }));
    await waitFor(() => expect(getLeaderboardMock).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 50 })));

    fireEvent.click(screen.getByRole('button', { name: 'benchmark.leaderboard.filterVersion' }));
    fireEvent.click(await screen.findByRole('option', { name: 'v2.2-2026.07' }));

    await waitFor(() => expect(getLeaderboardMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ scoringVersion: 'v2.2-2026.07', offset: 0 }),
    ));
  });

  it('steps back to the last page when the board shrinks under the current one', async () => {
    getBenchmarkVersionsMock.mockResolvedValue(null);
    getLeaderboardMock.mockResolvedValue({ total: 120, entries: [mkEntry()] });

    render(<LeaderboardView />);
    fireEvent.click(await screen.findByRole('button', { name: 'common.pager.next' }));
    fireEvent.click(await screen.findByRole('button', { name: 'common.pager.next' }));
    await waitFor(() => expect(screen.getByText('common.pager.pageOf n=3 total=3')).toBeInTheDocument());

    getLeaderboardMock.mockImplementation(({ offset }: { offset: number }) =>
      Promise.resolve({ total: 60, entries: offset < 60 ? [mkEntry()] : [] }));
    fireEvent.click(screen.getByRole('button', { name: 'common.pager.prev' }));
    fireEvent.click(screen.getByRole('button', { name: 'common.pager.next' }));

    await waitFor(() => expect(screen.getByText('common.pager.pageOf n=2 total=2')).toBeInTheDocument());
    expect(screen.queryByText('benchmark.leaderboard.empty')).not.toBeInTheDocument();
  });

  it('hides the pager when every entry fits on one page', async () => {
    getBenchmarkVersionsMock.mockResolvedValue(null);
    getLeaderboardMock.mockResolvedValue({ total: 1, entries: [mkEntry()] });

    render(<LeaderboardView />);

    await waitFor(() => expect(screen.getByText('Ryzen 9')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'common.pager.next' })).not.toBeInTheDocument();
  });

  it('renders the anonymous label when an entry has no display name', async () => {
    getBenchmarkVersionsMock.mockResolvedValue(null);
    getLeaderboardMock.mockResolvedValue({ total: 1, entries: [mkEntry({ displayName: null })] });

    render(<LeaderboardView />);

    await waitFor(() => expect(screen.getByText('benchmark.leaderboard.anonymous')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Ryzen 9/ }));
    expect(await screen.findByText('DDR5')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
