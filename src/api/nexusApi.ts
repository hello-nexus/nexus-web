// Thin client for the remote nexus-api (NestJS, default http://localhost:3000
// in dev, https://hellonexus.com/api in production). Separate from service.ts
// which talks to the local nexus-service on :9400.

import type { LeaderboardResponse, MatchResponse } from '../types/benchmark';

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
  cpuRaw?: number;
  cpuUnit?: string;
  gpuRaw?: number;
  gpuUnit?: string;
  ramRaw?: number;
  ramUnit?: string;
  storageRaw?: number;
  storageUnit?: string;
  scoringVersion?: string;
  ramModel?: string;
  storageModel?: string;
  os?: string;
  logicalCores?: number;
  benchTools?: Record<string, string>;
}

export interface SubmitBenchmarkResponse {
  id: string;
  composite: number;
  percentile: number;
  totalSubmissions: number;
  rank: number;
}

const SUBMISSION_ID_KEY = 'nexus_benchmark_submission_id';

export function getLastSubmissionId(): string | null {
  return localStorage.getItem(SUBMISSION_ID_KEY);
}

export function setLastSubmissionId(id: string): void {
  localStorage.setItem(SUBMISSION_ID_KEY, id);
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

export interface LeaderboardParams {
  scoringVersion?: string;
  category?: string;
  componentId?: string;
  limit?: number;
  offset?: number;
}

export async function getLeaderboard(params: LeaderboardParams = {}): Promise<LeaderboardResponse | null> {
  const qs = new URLSearchParams();
  if (params.scoringVersion) qs.set('scoringVersion', params.scoringVersion);
  if (params.category) qs.set('category', params.category);
  if (params.componentId) qs.set('componentId', params.componentId);
  if (params.limit != null) qs.set('limit', String(params.limit));
  if (params.offset != null) qs.set('offset', String(params.offset));
  const query = qs.toString();
  const url = `${BASE}/benchmarks/leaderboard${query ? `?${query}` : ''}`;
  // The cloud API can cold-start: the first request after idle can 502/503 or
  // time out. A single failure would dead-end the leaderboard view, so retry
  // transient failures (network error / 5xx / 429) with backoff before giving
  // up. A non-transient 4xx returns null immediately.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url);
      if (res.ok) return (await res.json()) as LeaderboardResponse;
      if (res.status < 500 && res.status !== 429) return null;
    } catch {
      // network error: fall through to retry
    }
    if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
  }
  return null;
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
