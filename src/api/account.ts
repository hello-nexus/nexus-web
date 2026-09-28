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

// Retry budget for verifyEmail below.
const TOKEN_POST_RETRY_ATTEMPTS = 3;
const TOKEN_POST_RETRY_DELAY_MS = 400;
// A ceiling on the whole attempt, retries included, so a request that never
// settles cannot leave a landing page spinning with no way out.
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
async function postTokenWithNetworkRetry(url: string, token: string): Promise<Response | null> {
  const abort = new AbortController();
  const deadline = setTimeout(() => abort.abort(), TOKEN_POST_DEADLINE_MS);
  try {
    for (let attempt = 0; attempt < TOKEN_POST_RETRY_ATTEMPTS; attempt++) {
      try {
        return await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
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

/**
 * POST /auth/password/confirm: applies a password change held behind the
 * emailed link. Sent once, never retried: a retry after a lost response would
 * find the token spent and report a change that did apply as invalid.
 */
export async function confirmPasswordChange(token: string): Promise<'ok' | 'invalid' | 'error'> {
  const abort = new AbortController();
  const deadline = setTimeout(() => abort.abort(), TOKEN_POST_DEADLINE_MS);
  try {
    const res = await fetch(`${BASE}/auth/password/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
      signal: abort.signal,
    });
    if (res.ok) return 'ok';
    return res.status === 400 ? 'invalid' : 'error';
  } catch {
    return 'error';
  } finally {
    clearTimeout(deadline);
  }
}

export type RecoveryOpenResult =
  /** Opened in the browser that asked for the reset: approved outright. */
  | { status: 'approved' }
  /** Opened anywhere else: the code to type on the device that asked. */
  | { status: 'code'; code: string }
  | { status: 'invalid' }
  | { status: 'error' };

/**
 * POST /auth/recovery/open. Sent once, never retried: a lost response on the
 * approving path would make a retry report a spent link as invalid.
 */
export async function openRecovery(token: string): Promise<RecoveryOpenResult> {
  const abort = new AbortController();
  const deadline = setTimeout(() => abort.abort(), TOKEN_POST_DEADLINE_MS);
  try {
    const res = await fetch(`${BASE}/auth/recovery/open`, {
      method: 'POST',
      // The web header plus credentials carry the recovery cookie, which is
      // what tells the api this is the browser that asked.
      headers: { 'Content-Type': 'application/json', 'X-Nexus-Auth': 'web' },
      credentials: 'include',
      body: JSON.stringify({ token }),
      signal: abort.signal,
    });
    if (res.status === 400) return { status: 'invalid' };
    if (!res.ok) return { status: 'error' };
    const data = (await res.json()) as { status?: string; code?: string };
    if (data.status === 'approved') return { status: 'approved' };
    if (data.status === 'code' && data.code) return { status: 'code', code: data.code };
    return { status: 'error' };
  } catch {
    return { status: 'error' };
  } finally {
    clearTimeout(deadline);
  }
}
