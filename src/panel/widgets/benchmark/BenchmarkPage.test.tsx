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
    h.result = null;
    h.telemetryEnabled = true;
    h.history = [];
    h.addRun.mockClear();
    h.updateRunSubmission.mockClear();
    mockSubmitCloudBenchmark.mockReset();
  });

  it('auto-submits and shows standing when telemetry is on', async () => {
    h.telemetryEnabled = true;
    mockSubmitCloudBenchmark.mockResolvedValue({ id: 'sub-1', percentile: 87, rank: 5, totalSubmissions: 100 });
    h.result = mkResult();

    render(<BenchmarkPage serviceOnline tab="run" onTabChange={() => {}} />);

    await waitFor(() => expect(mockSubmitCloudBenchmark).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText(/benchmark\.result\.percentile/)).toBeInTheDocument());
    expect(screen.queryByText('benchmark.result.uploadCta')).not.toBeInTheDocument();
  });

  it('does not auto-submit when telemetry is off, and submits only on explicit upload', async () => {
    h.telemetryEnabled = false;
    mockSubmitCloudBenchmark.mockResolvedValue({ id: 'sub-2', percentile: 42, rank: 60, totalSubmissions: 100 });
    h.result = mkResult();

    render(<BenchmarkPage serviceOnline tab="run" onTabChange={() => {}} />);

    await waitFor(() => expect(h.addRun).toHaveBeenCalledWith(expect.objectContaining({ runId: 'run-1' }), null));
    expect(mockSubmitCloudBenchmark).not.toHaveBeenCalled();

    const uploadButton = await screen.findByText('benchmark.result.uploadCta');
    await act(async () => {
      uploadButton.closest('button')!.click();
    });

    await waitFor(() => expect(mockSubmitCloudBenchmark).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText(/benchmark\.result\.percentile/)).toBeInTheDocument());
  });
});
