import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key, language: 'en' }),
}));

import { BenchmarkEntryDetail } from './BenchmarkEntryDetail';
import type { LeaderboardEntry } from '../../../types/benchmark';

function mkEntry(hardware: Partial<LeaderboardEntry['hardware']> = {}): LeaderboardEntry {
  return {
    id: 'entry-1',
    rank: 1,
    composite: 1500,
    displayName: null,
    createdAt: '2026-06-01T00:00:00Z',
    scoringVersion: 'v2.2-2026.07',
    cpu: { raw: 1, unit: 'x', score: 1 },
    gpu: { raw: 1, unit: 'x', score: 1 },
    ram: { raw: 1, unit: 'x', score: 1 },
    storage: { raw: 1, unit: 'x', score: 1 },
    hardware: {
      cpuModel: 'Intel Core Ultra 9 285K',
      gpuModels: ['RTX 5090'],
      ramModel: 'Corsair CMP64GX5M2B6000C30',
      storageModel: 'Samsung SSD 990 PRO 2TB',
      os: 'Windows 11 Pro',
      logicalCores: 24,
      ...hardware,
    },
    tools: {},
  };
}

describe('BenchmarkEntryDetail hardware card', () => {
  it('appends the peak clock to the CPU line and installed RAM to the RAM line', () => {
    render(<BenchmarkEntryDetail entry={mkEntry({ cpuMaxClockMhz: 5725, ramBytes: 64 * 1024 ** 3 })} numberFormat="comma" />);

    expect(screen.getByText('Intel Core Ultra 9 285K · 5,7 GHz')).toBeInTheDocument();
    expect(screen.getByText('Corsair CMP64GX5M2B6000C30 · 64 GB')).toBeInTheDocument();
  });

  it('shows bare models when the entry predates the extras, and never the core count', () => {
    render(<BenchmarkEntryDetail entry={mkEntry({ cpuMaxClockMhz: null })} />);

    expect(screen.getByText('Intel Core Ultra 9 285K')).toBeInTheDocument();
    expect(screen.getByText('Corsair CMP64GX5M2B6000C30')).toBeInTheDocument();
    expect(screen.queryByText(/cores/)).not.toBeInTheDocument();
  });
});
