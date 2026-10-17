import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string | number>) => {
      let text = key;
      if (params) for (const [k, v] of Object.entries(params)) text += ` ${k}=${v}`;
      return text;
    },
  }),
}));

import { BenchmarkResults } from './BenchmarkResults';
import type { BenchmarkResult } from '../../../types/benchmark';

function mkResult(overrides: Partial<BenchmarkResult> = {}): BenchmarkResult {
  return {
    runId: 'run-1',
    state: 'complete',
    startedAt: 1000,
    finishedAt: 2000,
    hardware: {
      cpuModel: 'Ryzen 9 9800X3D',
      gpuModels: ['RTX 5090'],
      ramModel: 'DDR5-6000',
      ramBytes: 34359738368,
      storageModel: 'Samsung 990 Pro',
      logicalCores: 16,
      os: 'Windows 11',
      architecture: 'x64',
    },
    composite: 1234.5,
    cpu: { key: 'cpu', label: 'CPU', score: 500, rawValue: 12.3, rawUnit: 'Mprimes/s', detail: 'multi-core' },
    gpu: { key: 'gpu', label: 'GPU', score: 600, rawValue: 45.6, rawUnit: 'GFLOPS', detail: 'OpenCL' },
    ram: { key: 'ram', label: 'RAM', score: 300, rawValue: 78.9, rawUnit: 'GB/s', detail: 'STREAM' },
    storage: { key: 'storage', label: 'Storage', score: 200, rawValue: 3.4, rawUnit: 'GB/s', detail: 'seq' },
    scoringVersion: 'v2.2-2026.07',
    tools: {},
    ...overrides,
  };
}

describe('BenchmarkResults', () => {
  it('does not render a spread badge when a sub-score has none', () => {
    render(<BenchmarkResults result={mkResult()} submission={null} submitting={false} />);

    expect(screen.queryByText(/benchmark\.result\.spread/)).not.toBeInTheDocument();
  });

  it('renders a compact plus-minus percent next to the score when spread is present', () => {
    render(<BenchmarkResults
      result={mkResult({
        cpu: { key: 'cpu', label: 'CPU', score: 500, rawValue: 12.3, rawUnit: 'Mprimes/s', detail: 'multi-core', spread: 0.023 },
      })}
      submission={null}
      submitting={false}
    />);

    expect(screen.getByText('benchmark.result.spread pct=2.3')).toBeInTheDocument();
  });

  it('shows the upload prompt only when onUpload is set and there is no submission yet', () => {
    render(<BenchmarkResults result={mkResult()} submission={null} submitting={false} />);
    expect(screen.queryByText('benchmark.result.publishCta')).not.toBeInTheDocument();
  });

  it('calls onUpload when the upload button is clicked, and hides it once submitting', () => {
    const onUpload = vi.fn();
    const { rerender } = render(
      <BenchmarkResults result={mkResult()} submission={null} submitting={false} onUpload={onUpload} />,
    );

    fireEvent.click(screen.getByText('benchmark.result.publishCta'));
    expect(onUpload).toHaveBeenCalledTimes(1);

    rerender(<BenchmarkResults result={mkResult()} submission={null} submitting onUpload={onUpload} />);
    expect(screen.queryByText('benchmark.result.publishCta')).not.toBeInTheDocument();
  });

  it('calls onDismissUpload from the Not now button without uploading', () => {
    const onUpload = vi.fn();
    const onDismissUpload = vi.fn();
    render(
      <BenchmarkResults result={mkResult()} submission={null} submitting={false} onUpload={onUpload} onDismissUpload={onDismissUpload} />,
    );
    fireEvent.click(screen.getByText('benchmark.result.publishDismiss'));
    expect(onDismissUpload).toHaveBeenCalledTimes(1);
    expect(onUpload).not.toHaveBeenCalled();
  });

  it('hides the upload prompt once a submission exists', () => {
    render(
      <BenchmarkResults
        result={mkResult()}
        submission={{ percentile: 50, rank: 10, total: 20 }}
        submitting={false}
        onUpload={vi.fn()}
      />,
    );
    expect(screen.queryByText('benchmark.result.publishCta')).not.toBeInTheDocument();
  });

  describe('standing', () => {
    const renderWith = (submission: { percentile: number; rank: number; total: number }) =>
      render(<BenchmarkResults result={mkResult()} submission={submission} submitting={false} standingAction={<button type="button">remove</button>} />);

    it('hides the standing for the only run on the board but keeps the action', () => {
      renderWith({ percentile: 0, rank: 1, total: 1 });
      expect(screen.queryByText(/benchmark\.result\.percentile/)).not.toBeInTheDocument();
      expect(screen.queryByText(/benchmark\.result\.rank/)).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'remove' })).toBeInTheDocument();
    });

    it('shows the rank inside the top 100', () => {
      renderWith({ percentile: 99.2, rank: 2, total: 135 });
      expect(screen.getByText('benchmark.result.rank rank=2 total=135')).toBeInTheDocument();
    });

    it('shows a Top % bucket past the top 100', () => {
      renderWith({ percentile: 90, rank: 120, total: 1281 });
      expect(screen.getByText('benchmark.leaderboard.top pct=10')).toBeInTheDocument();
      expect(screen.queryByText(/benchmark\.result\.rank/)).not.toBeInTheDocument();
    });

    it('shows no standing below the top half', () => {
      renderWith({ percentile: 3, rank: 1245, total: 1281 });
      expect(screen.queryByText(/benchmark\.result\.percentile/)).not.toBeInTheDocument();
      expect(screen.queryByText(/benchmark\.leaderboard\.top/)).not.toBeInTheDocument();
    });
  });
});
