import { useState, useCallback } from 'react';
import type { BenchmarkResult } from '../types/benchmark';

const STORAGE_KEY = 'nexus:benchmarkHistory';
const MAX_RUNS = 20;

export interface BenchmarkRun {
  id: string;
  timestamp: number;
  composite: number;
  cpu: number;
  gpu: number;
  ram: number;
  storage: number;
  cpuModel: string;
  gpuModels: string[];
  scoringVersion: string;
  result: BenchmarkResult;
  submissionId?: string | null;
  /** Leaderboard standing returned by the submit, so the Results tab can keep showing it. */
  submission?: BenchmarkStanding | null;
}

export interface BenchmarkStanding {
  percentile: number;
  rank: number;
  total: number;
}

function loadHistory(): BenchmarkRun[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as BenchmarkRun[]) : [];
  } catch {
    return [];
  }
}

export function useBenchmarkHistory() {
  const [history, setHistory] = useState<BenchmarkRun[]>(() => loadHistory());

  const addRun = useCallback((
    result: BenchmarkResult,
    submissionId?: string | null,
    submission?: BenchmarkStanding | null,
  ) => {
    const run: BenchmarkRun = {
      id: `${Date.now()}`,
      timestamp: Date.now(),
      composite: result.composite,
      cpu: result.cpu.score,
      gpu: result.gpu.score,
      ram: result.ram.score,
      storage: result.storage.score,
      cpuModel: result.hardware.cpuModel,
      gpuModels: result.hardware.gpuModels ?? [],
      scoringVersion: result.scoringVersion ?? '',
      result,
      submissionId,
      submission: submission ?? null,
    };
    setHistory(prev => {
      const next = [run, ...prev].slice(0, MAX_RUNS);
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* quota */ }
      return next;
    });
  }, []);

  const latest = history[0] ?? null;
  return { history, latest, addRun };
}
