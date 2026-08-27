// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { buildBenchmarkSubmission } from './benchmarkSubmission';
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
    tools: { primesieve: '12.0', clpeak: '4.0' },
    ...overrides,
  };
}

describe('buildBenchmarkSubmission', () => {
  it('maps the result and device id into the wire payload', () => {
    const payload = buildBenchmarkSubmission(mkResult(), 'device-abc');

    expect(payload.deviceId).toBe('device-abc');
    expect(payload.cpuModel).toBe('Ryzen 9 9800X3D');
    expect(payload.gpuModels).toEqual(['RTX 5090']);
    expect(payload.composite).toBe(1234.5);
    expect(payload.cpuScore).toBe(500);
    expect(payload.gpuScore).toBe(600);
    expect(payload.ramScore).toBe(300);
    expect(payload.storageScore).toBe(200);
    expect(payload.cpuRaw).toBe(12.3);
    expect(payload.cpuUnit).toBe('Mprimes/s');
    expect(payload.scoringVersion).toBe('v2.2-2026.07');
    expect(payload.ramModel).toBe('DDR5-6000');
    expect(payload.storageModel).toBe('Samsung 990 Pro');
    expect(payload.os).toBe('Windows 11');
    expect(payload.logicalCores).toBe(16);
    expect(payload.benchTools).toEqual({ primesieve: '12.0', clpeak: '4.0' });
  });

  it('nests per-axis raw metrics with the detail string', () => {
    const payload = buildBenchmarkSubmission(mkResult(), 'device-abc');

    expect(payload.rawMetrics).toMatchObject({
      cpu: { raw: 12.3, unit: 'Mprimes/s', detail: 'multi-core' },
      gpu: { raw: 45.6, unit: 'GFLOPS', detail: 'OpenCL' },
      ram: { raw: 78.9, unit: 'GB/s', detail: 'STREAM' },
      storage: { raw: 3.4, unit: 'GB/s', detail: 'seq' },
      os: 'Windows 11',
      cores: 16,
    });
  });

  it('never includes a displayName field', () => {
    const payload = buildBenchmarkSubmission(mkResult(), 'device-abc');

    expect(payload).not.toHaveProperty('displayName');
  });
});
