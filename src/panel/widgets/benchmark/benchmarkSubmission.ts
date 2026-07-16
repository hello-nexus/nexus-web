// Pure payload builder for a completed benchmark run. Kept free of React/the
// network layer so the field mapping is unit-testable independent of the
// submit call itself.

import type { CloudBenchmarkSubmitBody } from '../../../api/cloud';
import type { BenchmarkResult } from '../../../types/benchmark';

export function buildBenchmarkSubmission(result: BenchmarkResult, deviceId: string): CloudBenchmarkSubmitBody {
  return {
    deviceId,
    cpuModel: result.hardware.cpuModel,
    gpuModels: result.hardware.gpuModels,
    cpuScore: result.cpu.score,
    gpuScore: result.gpu.score,
    ramScore: result.ram.score,
    storageScore: result.storage.score,
    composite: result.composite,
    rawMetrics: {
      cpu: { raw: result.cpu.rawValue, unit: result.cpu.rawUnit, detail: result.cpu.detail },
      gpu: { raw: result.gpu.rawValue, unit: result.gpu.rawUnit, detail: result.gpu.detail },
      ram: { raw: result.ram.rawValue, unit: result.ram.rawUnit, detail: result.ram.detail },
      storage: { raw: result.storage.rawValue, unit: result.storage.rawUnit, detail: result.storage.detail },
      os: result.hardware.os,
      cores: result.hardware.logicalCores,
    },
    clientVersion: String(__APP_VERSION__ ?? '0'),
    cpuRaw: result.cpu.rawValue,
    cpuUnit: result.cpu.rawUnit,
    gpuRaw: result.gpu.rawValue,
    gpuUnit: result.gpu.rawUnit,
    ramRaw: result.ram.rawValue,
    ramUnit: result.ram.rawUnit,
    storageRaw: result.storage.rawValue,
    storageUnit: result.storage.rawUnit,
    scoringVersion: result.scoringVersion,
    ramModel: result.hardware.ramModel,
    storageModel: result.hardware.storageModel,
    os: result.hardware.os,
    logicalCores: result.hardware.logicalCores,
    benchTools: result.tools,
  };
}
