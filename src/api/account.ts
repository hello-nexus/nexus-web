// Thin client for nexus-api's PUBLIC account routes: profile lookup, email
// verification, and lost-password recovery links. Backs the browser-only
// surfaces (/u/<username>, /auth/verify, /auth/recover) - reuses
// nexusApi.ts's base-URL convention (production default, VITE_API_URL
// override).

const DEFAULT_API = 'https://api.hellonexus.com';
const BASE = import.meta.env.VITE_API_URL ?? DEFAULT_API;

export interface PublicAccountAvatar {
  large: string;
  small: string;
}

export interface PublicAccountDevice {
  hostname: string;
  specs: Record<string, string>;
  /** Client-added entry (no telemetry backing it) vs an auto-reported install. */
  manual: boolean;
  lastSeenAt: string;
}

export interface PublicBenchmarkEntry {
  id: string;
  composite: number;
  scoringVersion: string;
  createdAt: string;
  cpuModel: string;
  gpuModels: string[];
}

export interface PublicAccountBenchmarks {
  /** Null when the account has no submissions yet. */
  best: PublicBenchmarkEntry | null;
  recent: PublicBenchmarkEntry[];
}

export type PublicAccount =
  | { username: string; avatar: PublicAccountAvatar | null; isPrivate: true }
  | {
      username: string;
      avatar: PublicAccountAvatar | null;
      isPrivate: false;
      createdAt: string;
      devices: PublicAccountDevice[];
      benchmarks: PublicAccountBenchmarks;
    };

export type PublicAccountResult =
  | { status: 'ok'; account: PublicAccount }
  | { status: 'not-found' }
  | { status: 'error' };

/**
 * Consumed through @app by the Build portal's profile page; nothing inside
 * this repo calls it.
 *
 * GET /u/:username. Retries transient failures (network error / 5xx / 429)
 * with backoff - the cloud API can cold-start on Railway, same as
 * getLeaderboard() in nexusApi.ts. A non-transient 404 resolves immediately.
 */
export async function getPublicAccount(username: string, signal?: AbortSignal): Promise<PublicAccountResult> {
  const url = `${BASE}/u/${encodeURIComponent(username)}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { signal });
      if (res.ok) return { status: 'ok', account: (await res.json()) as PublicAccount };
      if (res.status === 404) return { status: 'not-found' };
      if (res.status < 500 && res.status !== 429) return { status: 'error' };
    } catch {
      // network error (or the caller aborted): fall through to retry
    }
    if (signal?.aborted) break;
    if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
  }
  return { status: 'error' };
}

// Retry budget shared by verifyEmail/completeRecovery below.
const TOKEN_POST_RETRY_ATTEMPTS = 3;
const TOKEN_POST_RETRY_DELAY_MS = 400;
// A ceiling on the whole attempt, retries included. The recovery page has no
// button to press once the code is in, so a request that never settles would
// leave it spinning with no way out.
const TOKEN_POST_DEADLINE_MS = 12_000;

/**
 * POST helper for the single-use verify/recovery tokens. Retries ONLY when
 * fetch itself throws (the request may never have reached the server, e.g.
 * a Railway cold-start connection refusal) - never on a definitive HTTP
 * response, even a 5xx, since the server already saw the request and a
 * retry could re-consume a token whose first response was merely lost in
 * transit (misreporting a real success as "already used"). Returns null once
 * every attempt has thrown.
 */
async function postTokenWithNetworkRetry(url: string, token: string, code?: string): Promise<Response | null> {
  const abort = new AbortController();
  const deadline = setTimeout(() => abort.abort(), TOKEN_POST_DEADLINE_MS);
  try {
    for (let attempt = 0; attempt < TOKEN_POST_RETRY_ATTEMPTS; attempt++) {
      try {
        return await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(code ? { token, code } : { token }),
          signal: abort.signal,
        });
      } catch {
        // A request still open at the deadline was aborted here, and retrying
        // it would hand back the same hang; anything else is a network error.
        if (abort.signal.aborted) return null;
      }
      if (attempt < TOKEN_POST_RETRY_ATTEMPTS - 1) {
        await new Promise(resolve => setTimeout(resolve, TOKEN_POST_RETRY_DELAY_MS * (attempt + 1)));
      }
    }
    return null;
  } finally {
    clearTimeout(deadline);
  }
}

export interface VerifyEmailResult {
  ok: boolean;
  /** On ok: the account was verified before this click (re-clicked link). */
  alreadyVerified?: boolean;
}

/**
 * POST /auth/verify. The token is opaque and single-use, so unlike
 * register/recovery this route is not enumeration-sensitive and can report
 * alreadyVerified on a re-clicked link. Any non-2xx response or a malformed
 * body degrades to a plain failure so an unexpected server shape still
 * resolves to a sane UI state; a pure network failure (see
 * postTokenWithNetworkRetry) also degrades to failure after retries are
 * exhausted rather than leaving the page stuck loading.
 */
export async function verifyEmail(token: string): Promise<VerifyEmailResult> {
  try {
    const res = await postTokenWithNetworkRetry(`${BASE}/auth/verify`, token);
    if (!res || !res.ok) return { ok: false };
    const data = (await res.json()) as { ok?: boolean; alreadyVerified?: boolean };
    if (data.ok) return data.alreadyVerified ? { ok: true, alreadyVerified: true } : { ok: true };
    return { ok: false };
  } catch {
    return { ok: false };
  }
}

export type RecoveryCompleteFailure =
  /** No code reached /complete; the form guards against it, other callers may not. */
  | 'code-required'
  /** Wrong code, grant still alive - attemptsLeft says how many remain. */
  | 'code-mismatch'
  /** Guesses spent: the grant is destroyed and a new link is needed. */
  | 'code-exhausted'
  /** Bad or expired link, or any failure the page cannot act on. */
  | 'invalid';

export interface RecoveryCompleteResult {
  ok: boolean;
  username?: string;
  reason?: RecoveryCompleteFailure;
  attemptsLeft?: number;
}

/** Maps the api's error body onto what the page can actually do about it. */
function recoveryFailure(body: unknown): { reason: RecoveryCompleteFailure; attemptsLeft?: number } {
  const err = body as { code?: string; attemptsLeft?: number } | null;
  switch (err?.code) {
    case 'code_required':
      return { reason: 'code-required' };
    case 'code_mismatch':
      return { reason: 'code-mismatch', attemptsLeft: err.attemptsLeft };
    case 'code_attempts_exhausted':
      return { reason: 'code-exhausted' };
    default:
      return { reason: 'invalid' };
  }
}

export async function completeRecovery(token: string, code?: string): Promise<RecoveryCompleteResult> {
  try {
    const res = await postTokenWithNetworkRetry(`${BASE}/auth/recovery/complete`, token, code);
    if (!res) return { ok: false, reason: 'invalid' };
    if (!res.ok) {
      // A 400 here is usually the code step, not a dead link, and the page
      // renders a very different thing for each.
      const body = await res.json().catch(() => null);
      // Nest serializes a BadRequestException built from an object as that
      // object, so the discriminator is at the top level.
      return { ok: false, ...recoveryFailure(body) };
    }
    return (await res.json()) as RecoveryCompleteResult;
  } catch {
    return { ok: false, reason: 'invalid' };
  }
}
