// Thin client for nexus-api's PUBLIC account routes: profile lookup, email
// verification, and lost-password recovery links. Backs the browser-only
// surfaces (/u/<username>, /auth/verify, /auth/recover) - reuses
// nexusApi.ts's base-URL convention (VITE_API_URL with a local-dev default).

const DEFAULT_API = 'http://localhost:3000';
const BASE = import.meta.env.VITE_API_URL ?? DEFAULT_API;

export interface PublicAccountAvatar {
  large: string;
  small: string;
}

export interface PublicAccountDevice {
  hostname: string;
  specs: Record<string, string>;
  lastSeenAt: string;
}

export type PublicAccount =
  | { username: string; avatar: PublicAccountAvatar | null; isPrivate: true }
  | {
      username: string;
      avatar: PublicAccountAvatar | null;
      isPrivate: false;
      createdAt: string;
      devices: PublicAccountDevice[];
    };

export type PublicAccountResult =
  | { status: 'ok'; account: PublicAccount }
  | { status: 'not-found' }
  | { status: 'error' };

/**
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
  for (let attempt = 0; attempt < TOKEN_POST_RETRY_ATTEMPTS; attempt++) {
    try {
      return await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
    } catch {
      // network error: fall through to retry
    }
    if (attempt < TOKEN_POST_RETRY_ATTEMPTS - 1) {
      await new Promise(resolve => setTimeout(resolve, TOKEN_POST_RETRY_DELAY_MS * (attempt + 1)));
    }
  }
  return null;
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

export interface RecoveryCompleteResult {
  ok: boolean;
  username?: string;
}

/**
 * POST /auth/recovery/complete. Enumeration-resistant per account-system.md
 * (recovery is always 200-shaped), so failure is read from the `ok` field
 * rather than the HTTP status; a non-2xx transport failure, or exhausting
 * the network retries in postTokenWithNetworkRetry, still degrades to
 * ok: false.
 */
export async function completeRecovery(token: string): Promise<RecoveryCompleteResult> {
  try {
    const res = await postTokenWithNetworkRetry(`${BASE}/auth/recovery/complete`, token);
    if (!res || !res.ok) return { ok: false };
    return (await res.json()) as RecoveryCompleteResult;
  } catch {
    return { ok: false };
  }
}
