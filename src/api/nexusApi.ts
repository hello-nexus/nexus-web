// Thin client for the remote nexus-api (NestJS). Separate from service.ts
// which talks to the local nexus-service on :9400. The production origin is
// the compiled-in default so a build missing VITE_API_URL still works; the
// committed .env.development points `npm run dev` at a local API.

import type { BenchmarkVersionInfo, LeaderboardResponse } from '../types/benchmark';
import type { FpsSignatureParams, FpsSignatureResponse, FpsTableResponse } from '../types/fps-estimates';
import type { GameScoresResponse, GameType } from '../types/games';
import { authFetchWithStatus } from './service';

const DEFAULT_API = 'https://api.hellonexus.com';
const BASE = import.meta.env.VITE_API_URL ?? DEFAULT_API;

// In a service-embedded build these reads go through the local service: a
// browser cannot attach the build credential the API will require, and routing
// them keeps the boards working once it does. Other builds keep the direct
// call and are admitted by their own Origin.
async function readApi<T>(servicePath: string, directUrl: string): Promise<{ ok: boolean; data: T | null; retryable: boolean }> {
  try {
    if (__SERVICE_BUILD__) {
      const { response, status } = await authFetchWithStatus(servicePath, { cache: 'no-store' });
      if (!response) return { ok: false, data: null, retryable: true };
      if (response.ok) return { ok: true, data: (await response.json()) as T, retryable: false };
      return { ok: false, data: null, retryable: status >= 500 || status === 429 };
    }
    const res = await fetch(directUrl);
    if (res.ok) return { ok: true, data: (await res.json()) as T, retryable: false };
    return { ok: false, data: null, retryable: res.status >= 500 || res.status === 429 };
  } catch {
    return { ok: false, data: null, retryable: true };
  }
}

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
  const suffix = query ? `?${query}` : '';
  // The cloud API can cold-start: the first request after idle can 502/503 or
  // time out. A single failure would dead-end the leaderboard view, so retry
  // transient failures (network error / 5xx / 429) with backoff before giving
  // up. A non-transient 4xx returns null immediately.
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await readApi<LeaderboardResponse>(
      `/cloud/benchmarks/leaderboard${suffix}`,
      `${BASE}/benchmarks/leaderboard${suffix}`,
    );
    if (r.ok) return r.data;
    if (!r.retryable) return null;
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
    const r = await readApi<BenchmarkVersionInfo[]>(
      '/cloud/benchmarks/versions',
      `${BASE}/benchmarks/versions`,
    );
    return r.ok ? r.data : null;
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

/**
 * GET /games/scores - public top-scores board for a panel game type. Same
 * cold-start retry shape as getLeaderboard: transient network/5xx/429
 * failures retry with backoff, a non-transient 4xx returns null immediately.
 */
export async function getGameScores(gameType: GameType, limit = 20): Promise<GameScoresResponse | null> {
  const qs = new URLSearchParams({ gameType, limit: String(limit) });
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await readApi<GameScoresResponse>(
      `/cloud/games/scores?${qs.toString()}`,
      `${BASE}/games/scores?${qs.toString()}`,
    );
    if (r.ok) return r.data;
    if (!r.retryable) return null;
    if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
  }
  return null;
}

/**
 * GET /fps/signature - resolves a rig to a signature key and the ladder
 * levels that already have community data. Same cold-start retry shape as
 * getLeaderboard. `res` is the only field the cloud route requires; every
 * other field is best-effort and degrades the match to a looser ladder level
 * when absent or unrecognized.
 */
export async function getFpsSignature(params: FpsSignatureParams): Promise<FpsSignatureResponse | null> {
  const qs = new URLSearchParams();
  if (params.gpu) qs.set('gpu', params.gpu);
  if (params.cpu) qs.set('cpu', params.cpu);
  if (params.mobo) qs.set('mobo', params.mobo);
  if (params.ramBytes != null) qs.set('ramBytes', String(params.ramBytes));
  qs.set('res', params.res);
  if (params.hz != null) qs.set('hz', String(params.hz));
  const suffix = `?${qs.toString()}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await readApi<FpsSignatureResponse>(
      `/cloud/fps/signature${suffix}`,
      `${BASE}/fps/signature${suffix}`,
    );
    if (r.ok) return r.data;
    if (!r.retryable) return null;
    if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
  }
  return null;
}

/**
 * GET /fps/table/{sigKey} - the per-game community FPS estimates for a
 * resolved signature. `games` is an empty array (not an error) whenever the
 * cloud has no data yet for that hardware class.
 */
export async function getFpsTable(sigKey: string): Promise<FpsTableResponse | null> {
  const path = `/fps/table/${encodeURIComponent(sigKey)}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await readApi<FpsTableResponse>(`/cloud${path}`, `${BASE}${path}`);
    if (r.ok) return r.data;
    if (!r.retryable) return null;
    if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
  }
  return null;
}
