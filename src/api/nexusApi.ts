// Thin client for the remote nexus-api (NestJS). Separate from service.ts
// which talks to the local nexus-service on :9400. The production origin is
// the compiled-in default so a build missing VITE_API_URL still works; the
// committed .env.development points `npm run dev` at a local API.

import type { BenchmarkVersionInfo, LeaderboardResponse } from '../types/benchmark';

const DEFAULT_API = 'https://api.hellonexus.com';
const BASE = import.meta.env.VITE_API_URL ?? DEFAULT_API;

const SUBMISSION_ID_KEY = 'nexus_benchmark_submission_id';

export function getLastSubmissionId(): string | null {
  return localStorage.getItem(SUBMISSION_ID_KEY);
}

export function setLastSubmissionId(id: string): void {
  localStorage.setItem(SUBMISSION_ID_KEY, id);
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

/**
 * GET /benchmarks/versions - a bare array of the scoring versions with
 * submission counts, newest first. Drives the leaderboard's version filter;
 * a failure hides the filter entirely rather than retrying, since it's a
 * non-critical enhancement over the (still-working) unfiltered leaderboard.
 */
export async function getBenchmarkVersions(): Promise<BenchmarkVersionInfo[] | null> {
  try {
    const res = await fetch(`${BASE}/benchmarks/versions`);
    if (!res.ok) return null;
    return (await res.json()) as BenchmarkVersionInfo[];
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
