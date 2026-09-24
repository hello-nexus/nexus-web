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

  it('renders a linked display name for an entry tied to a public account', async () => {
    getBenchmarkVersionsMock.mockResolvedValue(null);
    getLeaderboardMock.mockResolvedValue({ total: 1, entries: [mkEntry({ displayName: 'Nova' })] });

    render(<LeaderboardView />);

    const link = await screen.findByRole('link', { name: /Nova/ });
    expect(link).toHaveAttribute('href', 'https://build.hellonexus.com/u/Nova');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('renders the anonymous label when an entry has no display name', async () => {
    getBenchmarkVersionsMock.mockResolvedValue(null);
    getLeaderboardMock.mockResolvedValue({ total: 1, entries: [mkEntry({ displayName: null })] });

    render(<LeaderboardView />);

    await waitFor(() => expect(screen.getByText('benchmark.leaderboard.anonymous')).toBeInTheDocument());
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  describe('row keyboard activation', () => {
    it('toggles the detail row on Enter when the row itself is focused', async () => {
      getBenchmarkVersionsMock.mockResolvedValue(null);
      getLeaderboardMock.mockResolvedValue({ total: 1, entries: [mkEntry()] });

      render(<LeaderboardView />);
      const row = (await screen.findByText('Ryzen 9')).closest('tr');
      expect(row).not.toBeNull();

      fireEvent.keyDown(row!, { key: 'Enter' });

      expect(await screen.findByText('DDR5')).toBeInTheDocument();
    });

    it('toggles the detail row on Space when the row itself is focused', async () => {
      getBenchmarkVersionsMock.mockResolvedValue(null);
      getLeaderboardMock.mockResolvedValue({ total: 1, entries: [mkEntry()] });

      render(<LeaderboardView />);
      const row = (await screen.findByText('Ryzen 9')).closest('tr');

      fireEvent.keyDown(row!, { key: ' ' });

      expect(await screen.findByText('DDR5')).toBeInTheDocument();
    });

    it('leaves the row collapsed when Enter is pressed on a focused nested link, letting the link activate itself', async () => {
      getBenchmarkVersionsMock.mockResolvedValue(null);
      getLeaderboardMock.mockResolvedValue({ total: 1, entries: [mkEntry({ displayName: 'Nova' })] });

      render(<LeaderboardView />);
      const link = await screen.findByRole('link', { name: /Nova/ });

      fireEvent.keyDown(link, { key: 'Enter' });

      expect(screen.queryByText('DDR5')).not.toBeInTheDocument();
    });
  });
});
