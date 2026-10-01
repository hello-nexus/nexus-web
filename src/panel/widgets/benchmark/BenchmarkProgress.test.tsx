import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BenchmarkProgressFrame, BenchmarkResult, BenchmarkSubScore } from '../../../types/benchmark';
import { BenchmarkProgress } from './BenchmarkProgress';

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string | number>) => {
      let text = key;
      if (params) for (const [k, v] of Object.entries(params)) text += ` ${k}=${v}`;
      return text;
    },
  }),
}));

const ranges = vi.hoisted(() => ({ value: null as null | Record<string, number | string | null> }));
vi.mock('../../../api/nexusApi', () => ({
  getBenchmarkRanges: () => Promise.resolve(ranges.value),
}));

function sub(key: BenchmarkSubScore['key'], score: number): BenchmarkSubScore {
  return { key, label: key, score, rawValue: 1, rawUnit: 'u', detail: '' };
}

function frame(over: Partial<BenchmarkProgressFrame>): BenchmarkProgressFrame {
  return {
    runId: 'r1',
    state: 'running',
    overallPercent: 0.3,
    phase: { phase: 'ram', percent: 0.4, detail: 'STREAM Triad 2/3' },
    completedSubScores: [],
    ...over,
  };
}

describe('BenchmarkProgress', () => {
  beforeEach(() => { vi.useFakeTimers(); ranges.value = null; });
  afterEach(() => { vi.useRealTimers(); });

  it('holds a finished phase before showing the next one running', () => {
    render(<BenchmarkProgress progress={frame({ completedSubScores: [sub('cpu', 1888)] })} />);

    expect(screen.getByText('benchmark.progress.lockedIn')).toBeInTheDocument();
    expect(screen.queryByText('STREAM Triad 2/3')).not.toBeInTheDocument();

    act(() => { vi.advanceTimersByTime(2000); });

    expect(screen.getByText('benchmark.progress.nowTesting')).toBeInTheDocument();
    expect(screen.getByText('STREAM Triad 2/3')).toBeInTheDocument();
    expect(screen.getByText('40%')).toBeInTheDocument();
  });

  it('reveals phases one at a time when several finish together', () => {
    const { container, rerender } = render(<BenchmarkProgress progress={frame({ completedSubScores: [sub('cpu', 1888)] })} />);
    const nowName = () => container.querySelector('[class*="nowName"]')?.textContent;
    act(() => { vi.advanceTimersByTime(2000); });

    rerender(<BenchmarkProgress progress={frame({
      phase: { phase: 'gpu', percent: 0.1, detail: 'OpenCL warmup' },
      completedSubScores: [sub('cpu', 1888), sub('ram', 1308), sub('storage', 1236)],
    })} />);

    expect(nowName()).toBe('benchmark.phase.ram');
    act(() => { vi.advanceTimersByTime(2000); });
    expect(nowName()).toBe('benchmark.phase.storage');
    act(() => { vi.advanceTimersByTime(2000); });
    expect(screen.getByText('OpenCL warmup')).toBeInTheDocument();
  });

  it('shows the composite and reports the reveal done after the run completes', () => {
    const onRevealed = vi.fn();
    const all = [sub('cpu', 1888), sub('ram', 1308), sub('storage', 1236), sub('gpu', 5902)];
    render(
      <BenchmarkProgress
        progress={frame({ state: 'complete', overallPercent: 1, phase: { phase: 'done', percent: 1, detail: '' }, completedSubScores: all })}
        onRevealed={onRevealed}
      />,
    );

    for (let i = 0; i < 4; i++) act(() => { vi.advanceTimersByTime(2000); });
    expect(screen.getByText('benchmark.result.composite')).toBeInTheDocument();
    expect(onRevealed).not.toHaveBeenCalled();

    act(() => { vi.advanceTimersByTime(2800); });
    expect(onRevealed).toHaveBeenCalledTimes(1);
  });

  it('scales a finished column against the part\'s top-1% score', async () => {
    ranges.value = { scoringVersion: 'v2.2-2026.07', cpu: 4000, gpu: null, ram: null, storage: null };
    const { container } = render(<BenchmarkProgress progress={frame({ completedSubScores: [sub('cpu', 1000)] })} />);
    await act(async () => { await Promise.resolve(); });

    const solid = container.querySelector('[class*="solid"]') as HTMLElement;
    expect(solid.style.height).toBe('25%');
  });

  it('falls back to the log scale when no ranges are available', async () => {
    const { container } = render(<BenchmarkProgress progress={frame({ completedSubScores: [sub('cpu', 1000)] })} />);
    await act(async () => { await Promise.resolve(); });

    const solid = container.querySelector('[class*="solid"]') as HTMLElement;
    expect(solid.style.height).toBe('50%');
  });

  it('finishes the reveal from the REST result when the final frame never arrives', () => {
    const onRevealed = vi.fn();
    const result = {
      runId: 'r1', state: 'complete', composite: 2060.4,
      cpu: sub('cpu', 1888), ram: sub('ram', 1308), storage: sub('storage', 1236), gpu: sub('gpu', 5902),
    } as BenchmarkResult;
    const { container } = render(
      <BenchmarkProgress
        progress={frame({ phase: { phase: 'gpu', percent: 0.5, detail: 'OpenCL 2/3' }, completedSubScores: [sub('cpu', 1888)] })}
        result={result}
        onRevealed={onRevealed}
      />,
    );

    for (let i = 0; i < 4; i++) act(() => { vi.advanceTimersByTime(2000); });
    expect(screen.getByText('benchmark.result.composite')).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(1500); });
    expect(container.querySelector('[class*="bigScore"]')?.textContent).toBe('2060');

    act(() => { vi.advanceTimersByTime(1300); });
    expect(onRevealed).toHaveBeenCalledTimes(1);
  });
});
