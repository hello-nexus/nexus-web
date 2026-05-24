import type { ComponentCategory, ComponentOption } from './builder';

export interface HardwareIdentity {
  cpuModel: string;
  gpuModels: string[];
  ramModel: string;
  ramBytes: number;
  storageModel: string;
  logicalCores: number;
  os: string;
  architecture: string;
}

export interface BenchmarkSubScore {
  key: 'cpu' | 'gpu' | 'ram' | 'storage';
  label: string;
  score: number;
  rawValue: number;
  rawUnit: string;
  detail: string;
}

export interface BenchmarkPhaseProgress {
  phase: string;
  percent: number;
  detail: string;
  currentRaw: number;
  currentUnit: string;
}

export interface BenchmarkProgressFrame {
  runId: string;
  state: 'running' | 'complete' | 'cancelled' | 'failed' | string;
  overallPercent: number;
  phase: BenchmarkPhaseProgress;
  completedSubScores: BenchmarkSubScore[];
}

export interface BenchmarkResult {
  runId: string;
  state: string;
  startedAt: number;
  finishedAt: number;
  hardware: HardwareIdentity;
  composite: number;
  cpu: BenchmarkSubScore;
  gpu: BenchmarkSubScore;
  ram: BenchmarkSubScore;
  storage: BenchmarkSubScore;
  error?: string;
}

export interface StartBenchmarkResponse {
  runId: string;
  started: boolean;
  error?: string;
}

/** A match candidate returned by the nexus-api fuzzy matcher. */
export interface MatchCandidate {
  id: string;
  title: string;
  brand: string | null;
  chip: string | null;
  normalizedKey: string;
  confidence: number;
}

export interface MatchResponse {
  cpu?: MatchCandidate | null;
  gpu?: MatchCandidate[];
  ram?: MatchCandidate | null;
  storage?: MatchCandidate | null;
}

export interface DetectedComponents {
  cpu?: ComponentOption;
  gpu?: ComponentOption[];
  ram?: ComponentOption;
  storage?: ComponentOption;
}

export type DetectedByCategory = Partial<Record<ComponentCategory, ComponentOption[]>>;
