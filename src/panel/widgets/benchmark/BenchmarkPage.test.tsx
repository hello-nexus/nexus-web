import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BenchmarkResult } from '../../../types/benchmark';

/* eslint-disable @typescript-eslint/no-explicit-any */

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string | number>) => {
      let text = key;
      if (params) for (const [k, v] of Object.entries(params)) text += ` ${k}=${v}`;
      return text;
    },
  }),
}));

function mkResult(): BenchmarkResult {
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
  } as BenchmarkResult;
}

function mkRun(id: string, result: BenchmarkResult, submissionId: string | null = null) {
  return {
    id,
    timestamp: 1_700_000_000_000,
    composite: result.composite,
    cpu: result.cpu.score,
    gpu: result.gpu.score,
    ram: result.ram.score,
    storage: result.storage.score,
    cpuModel: result.hardware.cpuModel,
    gpuModels: result.hardware.gpuModels,
    scoringVersion: result.scoringVersion ?? '',
    result,
    submissionId,
    submission: null,
  };
}

const h = vi.hoisted(() => ({
  result: null as BenchmarkResult | null,
  telemetryEnabled: true as boolean | null,
  addRun: vi.fn(() => `run-${Date.now()}`),
  updateRunSubmission: vi.fn(),
  history: [] as any[],
}));

const mockSubmitCloudBenchmark = vi.fn();

vi.mock('../../../hooks/useBenchmark', () => ({
  useBenchmark: () => ({
    status: h.result ? 'complete' : 'idle',
    progress: null,
    result: h.result,
    error: null,
    start: vi.fn(),
    cancel: vi.fn(),
    reset: vi.fn(async () => { h.result = null; }),
  }),
}));

vi.mock('../../../hooks/useBenchmarkHistory', () => ({
  useBenchmarkHistory: () => ({
    history: h.history,
    addRun: h.addRun,
    updateRunSubmission: h.updateRunSubmission,
  }),
}));

vi.mock('../../../hooks/useSystemSpecs', () => ({
  useSystemSpecs: () => ({ specs: null }),
}));

vi.mock('../../../api/nexusApi', () => ({
  getDeviceId: () => 'device-1',
  getLastSubmissionId: () => null,
  setLastSubmissionId: vi.fn(),
}));

vi.mock('../../../api/cloud', () => ({
  submitCloudBenchmark: (...args: any[]) => mockSubmitCloudBenchmark(...args),
}));

vi.mock('../../../api/telemetry', () => ({
  fetchTelemetryConsent: async () => (h.telemetryEnabled === null ? null : { enabled: h.telemetryEnabled }),
}));

import { BenchmarkPage } from './BenchmarkPage';

describe('BenchmarkPage telemetry-gated submission', () => {
  beforeEach(() => {
    sessionStorage.clear();
    h.result = null;
    h.telemetryEnabled = true;
    h.history = [];
    h.addRun.mockReset();
    h.addRun.mockImplementation(((result: BenchmarkResult, submissionId?: string | null) => {
      const id = `hist-${h.history.length + 1}`;
      h.history = [mkRun(id, result, submissionId ?? null), ...h.history];
      return id;
    }) as any);
    h.updateRunSubmission.mockReset();
    h.updateRunSubmission.mockImplementation(((id: string, submissionId: string, submission: unknown) => {
      h.history = h.history.map(run => (run.id === id ? { ...run, submissionId, submission } : run));
    }) as any);
    mockSubmitCloudBenchmark.mockReset();
  });

  it('auto-submits and shows standing when telemetry is on', async () => {
    h.telemetryEnabled = true;
    mockSubmitCloudBenchmark.mockResolvedValue({ id: 'sub-1', percentile: 87, rank: 5, totalSubmissions: 100 });
    h.result = mkResult();

    render(<BenchmarkPage serviceOnline tab="results" onTabChange={() => {}} />);

    await waitFor(() => expect(mockSubmitCloudBenchmark).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText(/benchmark\.result\.percentile/)).toBeInTheDocument());
    expect(screen.queryByText('benchmark.result.uploadCta')).not.toBeInTheDocument();
  });

  it('does not auto-submit when telemetry is off, and submits only on explicit upload', async () => {
    h.telemetryEnabled = false;
    mockSubmitCloudBenchmark.mockResolvedValue({ id: 'sub-2', percentile: 42, rank: 60, totalSubmissions: 100 });
    h.result = mkResult();

    render(<BenchmarkPage serviceOnline tab="results" onTabChange={() => {}} />);

    await waitFor(() => expect(h.addRun).toHaveBeenCalledWith(expect.objectContaining({ runId: 'run-1' }), null));
    expect(mockSubmitCloudBenchmark).not.toHaveBeenCalled();

    const uploadButton = await screen.findByText('benchmark.result.uploadCta');
    await act(async () => {
      uploadButton.closest('button')!.click();
    });

    await waitFor(() => expect(mockSubmitCloudBenchmark).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText(/benchmark\.result\.percentile/)).toBeInTheDocument());
  });

  it('records a run handed over twice (same runId, new object) only once', async () => {
    h.telemetryEnabled = false;
    h.result = mkResult();
    const { rerender } = render(<BenchmarkPage serviceOnline tab="results" onTabChange={() => {}} />);
    await waitFor(() => expect(h.addRun).toHaveBeenCalledTimes(1));

    h.result = mkResult();
    rerender(<BenchmarkPage serviceOnline tab="results" onTabChange={() => {}} />);
    await waitFor(() => expect(screen.getByText('benchmark.result.uploadCta')).toBeInTheDocument());
    expect(h.addRun).toHaveBeenCalledTimes(1);
  });

  it('keeps offering the upload after a failed one', async () => {
    h.telemetryEnabled = false;
    mockSubmitCloudBenchmark.mockRejectedValueOnce(new Error('offline'));
    h.result = mkResult();
    render(<BenchmarkPage serviceOnline tab="results" onTabChange={() => {}} />);

    const button = await screen.findByText('benchmark.result.uploadCta');
    await act(async () => { button.closest('button')!.click(); });

    await waitFor(() => expect(mockSubmitCloudBenchmark).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('benchmark.result.uploadCta')).toBeInTheDocument();
    expect(h.updateRunSubmission).not.toHaveBeenCalled();
  });

  it('keeps offering the upload when the submit returns nothing', async () => {
    h.telemetryEnabled = false;
    mockSubmitCloudBenchmark.mockResolvedValueOnce(null);
    h.result = mkResult();
    render(<BenchmarkPage serviceOnline tab="results" onTabChange={() => {}} />);

    const button = await screen.findByText('benchmark.result.uploadCta');
    await act(async () => { button.closest('button')!.click(); });

    await waitFor(() => expect(mockSubmitCloudBenchmark).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('benchmark.result.uploadCta')).toBeInTheDocument();
    expect(h.updateRunSubmission).not.toHaveBeenCalled();
  });

  it('offers the upload for an unsubmitted saved run after returning to the page', async () => {
    h.telemetryEnabled = false;
    h.history = [mkRun('hist-9', mkResult())];

    render(<BenchmarkPage serviceOnline tab="results" onTabChange={() => {}} />);

    expect(await screen.findByText('benchmark.result.uploadCta')).toBeInTheDocument();
  });

  it('saves the run and offers the upload when the consent read fails', async () => {
    h.telemetryEnabled = null;
    h.result = mkResult();

    render(<BenchmarkPage serviceOnline tab="results" onTabChange={() => {}} />);

    await waitFor(() => expect(h.addRun).toHaveBeenCalledWith(expect.objectContaining({ runId: 'run-1' }), null));
    expect(await screen.findByText('benchmark.result.uploadCta')).toBeInTheDocument();
    expect(mockSubmitCloudBenchmark).not.toHaveBeenCalled();
  });

  it('keeps the Run tab as the launcher after a run completes', async () => {
    h.telemetryEnabled = false;
    h.result = mkResult();

    render(<BenchmarkPage serviceOnline tab="run" onTabChange={() => {}} />);

    await waitFor(() => expect(h.addRun).toHaveBeenCalledTimes(1));
    expect(screen.getByText('benchmark.start')).toBeInTheDocument();
    expect(screen.queryByText('benchmark.result.composite')).not.toBeInTheDocument();
  });

  it('shows the selected history run at the top of the Results tab', async () => {
    h.history = [
      mkRun('hist-2', { ...mkResult(), runId: 'run-2', composite: 2000 }),
      mkRun('hist-1', { ...mkResult(), runId: 'run-1', composite: 1500 }),
    ];
    const { container } = render(<BenchmarkPage serviceOnline tab="results" onTabChange={() => {}} />);
    const shownScore = () => container.querySelector('[class*="compositeScore"]')?.textContent;

    expect(shownScore()).toBe('2000');
    const rows = container.querySelectorAll('button[aria-pressed]');
    expect(rows).toHaveLength(2);
    expect(rows[0].getAttribute('aria-pressed')).toBe('true');

    await act(async () => { (rows[1] as HTMLButtonElement).click(); });

    expect(shownScore()).toBe('1500');
    expect(rows[1].getAttribute('aria-pressed')).toBe('true');
  });

  it('opens the Results tab on the best run when no benchmark just finished', () => {
    h.history = [
      mkRun('hist-2', { ...mkResult(), runId: 'run-2', composite: 1500 }),
      mkRun('hist-1', { ...mkResult(), runId: 'run-1', composite: 2000 }),
    ];
    const { container } = render(<BenchmarkPage serviceOnline tab="results" onTabChange={() => {}} />);

    expect(container.querySelector('[class*="compositeScore"]')?.textContent).toBe('2000');
    expect(screen.getByRole('radio', { name: 'benchmark.results.best' })).toHaveAttribute('aria-checked', 'true');
  });

  it('shows the latest run after a benchmark finishes', async () => {
    h.telemetryEnabled = false;
    h.history = [mkRun('hist-old', { ...mkResult(), runId: 'run-0', composite: 3000 })];
    h.result = mkResult();
    const { container, rerender } = render(<BenchmarkPage serviceOnline tab="results" onTabChange={() => {}} />);

    await waitFor(() => expect(h.addRun).toHaveBeenCalledTimes(1));
    rerender(<BenchmarkPage serviceOnline tab="results" onTabChange={() => {}} />);
    expect(container.querySelector('[class*="compositeScore"]')?.textContent).toBe(String(Math.round(mkResult().composite)));
    expect(screen.getByRole('radio', { name: 'benchmark.results.latest' })).toHaveAttribute('aria-checked', 'true');
  });

  it('keeps a manual Latest/Best pick for the rest of the session', async () => {
    h.history = [
      mkRun('hist-2', { ...mkResult(), runId: 'run-2', composite: 1500 }),
      mkRun('hist-1', { ...mkResult(), runId: 'run-1', composite: 2000 }),
    ];
    const first = render(<BenchmarkPage serviceOnline tab="results" onTabChange={() => {}} />);
    await act(async () => { screen.getByRole('radio', { name: 'benchmark.results.latest' }).click(); });
    expect(first.container.querySelector('[class*="compositeScore"]')?.textContent).toBe('1500');
    first.unmount();

    const again = render(<BenchmarkPage serviceOnline tab="results" onTabChange={() => {}} />);
    expect(again.container.querySelector('[class*="compositeScore"]')?.textContent).toBe('1500');
  });
});
