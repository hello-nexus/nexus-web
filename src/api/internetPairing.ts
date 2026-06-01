// Internet pairing for brand-new phones (Phase 1 relay transport).
//
// A phone scans the QR and lands on hellonexus.com/r/pair. Today the page just
// redirects to the PC's LAN IP — which only works when the phone shares the
// PC's network. This module makes pairing work from ANY network:
//
//   1. LAN-first fast path: try the existing HTTP claim against the PC's
//      LAN address (host:httpPort from the QR) with a SHORT timeout. On the
//      same network this succeeds in a few ms and the caller keeps today's
//      behavior (redirect into the LAN panel).
//   2. Relay fallback: if the LAN claim times out / is unreachable, do a
//      RELAY claim — derive rid_pair from the QR `pair` token, rendezvous with
//      the PC over the cloud relay, send one sealed claim, and get back a
//      session token. The phone then runs the panel over the relay from the
//      hellonexus.com origin (the existing useMultiplexSocket relay path keys
//      off the stored session token).
//
// The crypto + relay wire protocol are reused verbatim from relayChannel /
// relayCrypto; this module only owns the LAN-first→relay decision + token
// persistence.

import { resolveRelayWs } from './service';
import { claimPanelPhonePairingLan } from './panel';
import { pairOverRelay } from '../hooks/relayChannel';
import { storePhoneToken } from './auth';

// How long to wait for the LAN claim before declaring the PC LAN-unreachable
// and falling through to the relay. Short on purpose: when off-LAN the request
// either fails fast (connection refused) or hangs on an unroutable private IP,
// and a brand-new phone shouldn't stare at a spinner for the full default
// fetch timeout before the relay path even starts. On-LAN the claim returns
// well inside this window.
export const LAN_CLAIM_TIMEOUT_MS = 2500;

export type InternetPairResult =
  // LAN reachable: keep today's behavior — redirect the browser into the LAN
  // panel. The token was already issued by the PC's HTTP claim; the LAN panel
  // re-claims/uses it as before, so we don't store anything here.
  | { kind: 'lan'; token: string; machineName?: string }
  // Relay claim succeeded: a session token was minted + stored under the
  // hellonexus.com origin. The caller renders/runs the panel over the relay.
  | { kind: 'relay'; token: string; machineName?: string; spki?: string }
  // The PC was reachable (LAN or relay) but refused the claim (expired token).
  | { kind: 'rejected'; error: string }
  // Neither LAN nor relay produced a reply (PC offline, relay disabled, no
  // network). Distinct from 'rejected' so the UI can say "couldn't reach" vs.
  // "pairing expired".
  | { kind: 'unreachable' };

export interface InternetPairParams {
  host: string;
  httpPort: string;
  pairToken: string;
  deviceName: string;
}

// Once-per-pair-token guard. The PairRedirect effect can fire more than once
// for the same mount (React 18 StrictMode double-invoke, a Suspense/remount, or
// a re-render that re-runs the effect) — and each invocation that reaches the
// relay branch opens a SEPARATE rid_pair relay client with a fresh connSalt.
// The relay enforces one client per rid, so the duplicate races the first and
// ~1/3 of the time kills the winning claim (close 4409) → "Couldn't reach your
// PC." Caching the in-flight promise keyed by the pair token collapses every
// repeat call for the same attempt onto the SAME single LAN-probe + relay
// claim, so the rid_pair channel is opened exactly once. The entry is cleared
// when the promise settles so a genuinely new pair attempt (a fresh token after
// a failure, or a re-scan) starts clean.
const inFlightPairs = new Map<string, Promise<InternetPairResult>>();

/**
 * Run the LAN-first → relay pairing decision for a brand-new phone.
 *
 * Idempotent per pair token: concurrent or repeated calls with the same
 * `pairToken` share one in-flight attempt (one LAN probe, one relay claim).
 *
 * Decision logic:
 *   - LAN claim with a {@link LAN_CLAIM_TIMEOUT_MS} timeout:
 *       paired      → { kind: 'lan' }      (fast path, redirect to LAN panel)
 *       refused     → { kind: 'rejected' } (token expired; don't try relay —
 *                       the relay would refuse the same token)
 *       no reply    → fall through to relay
 *   - Relay claim:
 *       claim-ok    → store the session token, { kind: 'relay' }
 *       claim-err   → { kind: 'rejected' }
 *       transport   → { kind: 'unreachable' }
 */
export function pairOverInternet(params: InternetPairParams): Promise<InternetPairResult> {
  const existing = inFlightPairs.get(params.pairToken);
  if (existing) return existing;

  const attempt = runPairAttempt(params).finally(() => {
    inFlightPairs.delete(params.pairToken);
  });
  inFlightPairs.set(params.pairToken, attempt);
  return attempt;
}

async function runPairAttempt(params: InternetPairParams): Promise<InternetPairResult> {
  const { host, httpPort, pairToken, deviceName } = params;

  // 1. LAN-first fast path.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LAN_CLAIM_TIMEOUT_MS);
  let lan: Awaited<ReturnType<typeof claimPanelPhonePairingLan>> = null;
  try {
    lan = await claimPanelPhonePairingLan(host, httpPort, pairToken, controller.signal);
  } finally {
    clearTimeout(timer);
  }
  if (lan?.paired && lan.token) {
    return { kind: 'lan', token: lan.token, machineName: lan.machineName };
  }
  if (lan && lan.paired === false && lan.error) {
    // The PC answered on the LAN and refused (expired/used token). The relay
    // claim would hit the same token state, so surface the rejection now.
    return { kind: 'rejected', error: lan.error };
  }

  // 2. Relay fallback (LAN unreachable / timed out / no answer).
  try {
    const result = await pairOverRelay(resolveRelayWs(), pairToken, deviceName);
    if (result.ok) {
      // Persist under the hellonexus.com origin so the panel — and a later
      // reopen of hellonexus.com — reconnects over the relay using this token.
      storePhoneToken(result.sessionToken);
      return { kind: 'relay', token: result.sessionToken, machineName: result.machineName, spki: result.spki };
    }
    return { kind: 'rejected', error: result.error };
  } catch {
    // Transport/handshake failure: relay disabled, no host link, network down.
    return { kind: 'unreachable' };
  }
}
