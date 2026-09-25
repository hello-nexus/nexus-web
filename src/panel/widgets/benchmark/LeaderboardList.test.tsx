import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import { LeaderboardList } from './LeaderboardList';
import type { LeaderboardEntry } from '../../../types/benchmark';

function mkEntry(id: string, rank: number): LeaderboardEntry {
  const axis = { raw: 1, unit: 'x', score: 1 };
  return {
    id, rank, composite: 3000 - rank, displayName: null, createdAt: '2026-06-01T00:00:00Z', scoringVersion: 'v2',
    cpu: axis, gpu: axis, ram: axis, storage: axis,
    hardware: { cpuModel: `CPU ${rank}`, gpuModels: [], ramModel: 'DDR5', storageModel: 'NVMe', os: 'Windows 11', logicalCores: 16 },
    tools: {},
  };
}

describe('LeaderboardList', () => {
  it('renders each row as a real link when given an href builder', () => {
    render(<LeaderboardList entries={[mkEntry('a b', 1), mkEntry('c', 2)]} ownId={null} entryHref={e => `/bench/${encodeURIComponent(e.id)}`} />);

    const links = screen.getAllByRole('link');
    expect(links.map(l => l.getAttribute('href'))).toEqual(['/bench/a%20b', '/bench/c']);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('badges only the visitor\'s own entry', () => {
    render(<LeaderboardList entries={[mkEntry('a', 1), mkEntry('mine', 2)]} ownId="mine" onOpen={() => {}} />);

    const badges = screen.getAllByText('benchmark.leaderboard.yourEntry');
    expect(badges).toHaveLength(1);
    expect(badges[0].closest('button')).toHaveTextContent('CPU 2');
  });
});
