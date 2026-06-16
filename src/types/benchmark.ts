import type { ComponentCategory, ComponentOption } from './builder';

export interface BenchmarkBaselines {
  cpu: number;
  gpu: number;
  ram: number;
  storage: number;
}

export interface LeaderboardEntry {
  id: string;
  rank: number;
  composite: number;
  displayName: string | null;
  createdAt: string;
  scoringVersion: string;
  cpu: { raw: number; unit: string; score: number };
  gpu: { raw: number; unit: string; score: number };
  ram: { raw: number; unit: string; score: number };
  storage: { raw: number; unit: string; score: number };
  hardware: {
    cpuModel: string;
    gpuModels: string[];
    ramModel: string;
    storageModel: string;
    os: string;
    logicalCores: number;
  };
  tools: Record<string, string>;
}

export interface LeaderboardResponse {
  total: number;
  entries: LeaderboardEntry[];
}

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
  scoringVersion?: string;
  baselines?: BenchmarkBaselines;
  tools?: Record<string, string>;
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
