// Thin client for the remote nexus-api (NestJS, default http://localhost:3000
// in dev, https://hellonexus.com/api in production). Separate from service.ts
// which talks to the local nexus-service on :9400.

import type { MatchResponse } from '../types/benchmark';

const DEFAULT_API = 'http://localhost:3000';
const BASE = import.meta.env.VITE_API_URL ?? DEFAULT_API;

export async function matchComponents(
  query: { cpuModel?: string; gpuModels?: string[]; ramModel?: string; storageModel?: string },
  signal?: AbortSignal,
): Promise<MatchResponse | null> {
  try {
    const res = await fetch(`${BASE}/catalog/match`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(query),
      signal,
    });
    if (!res.ok) return null;
    return (await res.json()) as MatchResponse;
  } catch {
    return null;
  }
}

export interface SubmitBenchmarkBody {
  deviceId: string;
  cpuComponentId?: string | null;
  gpuComponentIds?: string[];
  ramComponentId?: string | null;
  storageComponentId?: string | null;
  cpuModel?: string;
  gpuModels?: string[];
  cpuScore: number;
  gpuScore: number;
  ramScore: number;
  storageScore: number;
  composite: number;
  rawMetrics: Record<string, unknown>;
  clientVersion?: string;
}

export interface SubmitBenchmarkResponse {
  id: string;
  composite: number;
  percentile: number;
  totalSubmissions: number;
  rank: number;
}

export async function submitBenchmark(
  body: SubmitBenchmarkBody,
  bearerToken?: string,
): Promise<SubmitBenchmarkResponse | null> {
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (bearerToken) headers['Authorization'] = `Bearer ${bearerToken}`;
    const res = await fetch(`${BASE}/benchmarks/submit`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    return (await res.json()) as SubmitBenchmarkResponse;
  } catch {
    return null;
  }
}

/** Stable per-browser device id stored in localStorage. Generated lazily. */
export function getDeviceId(): string {
  const key = 'nexus_benchmark_device_id';
  let id = localStorage.getItem(key);
  if (id && id.length >= 16) return id;
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  id = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  localStorage.setItem(key, id);
  return id;
}
