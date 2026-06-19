// Internet pairing for brand-new phones (Phase 1 relay transport).
//
// A phone scans the QR and lands on hellonexus.com/r/pair. Pairing must work on
// the SAME LAN as the PC (free, direct) AND from any other network (over the
// paid cloud relay). The /r/pair entry (PairRedirect.tsx) drives a TIERED flow;
// this module owns the two transports it picks between:
//
//   - LOCAL ORIGIN (the PC's own panel on :9400/:9443) → pairOverInternet():
//       LAN-first fast path - try the existing HTTP claim against the PC's LAN
//       address (host:httpPort from the QR) with a SHORT timeout. On the same
//       network this succeeds in a few ms and the caller keeps today's behavior
//       (redirect into the LAN panel). If it times out / is unreachable, fall
//       through to a relay claim.
//
//   - REMOTE ORIGIN (hellonexus.com, served over https) → PairRedirect drives
//       the tiers itself (the plain-HTTP LAN *fetch* is gone - on WebKit it
//       raised a fatal uncaught "access control" pageerror):
//         TIER 1 (direct LAN, free): NAVIGATE the browser to the PC's plain-HTTP
//           panel. A navigation is NOT a fetch, so it is exempt from mixed-
//           content / access-control aborts. On the same LAN this commits and
//           the PC-served panel runs the direct same-origin claim - no relay.
//         TIER 2 (relay fallback): if the direct navigation never commits
//           (PC off-LAN/unreachable), pairOverRelayClaim() does the relay claim.
//       PairRedirect arms a timer before the Tier-1 navigation; a committed
//       navigation unloads this page and destroys the timer, so the relay only
//       runs when the PC is NOT directly reachable.
//
// The crypto + relay wire protocol are reused verbatim from relayChannel /
// relayCrypto; this module only owns the transport decision + token
// persistence.

import { resolveRelayWs } from './service';
import { claimPanelPhonePairingLan } from './panel';
import { pairOverRelay } from '../hooks/relayChannel';
import { storePhoneToken } from './auth';
import { getDeviceId } from './deviceId';

// How long to wait for the LAN claim before declaring the PC LAN-unreachable
// and falling through to the relay. Short on purpose: when off-LAN the request
// either fails fast (connection refused) or hangs on an unroutable private IP,
// and a brand-new phone shouldn't stare at a spinner for the full default
// fetch timeout before the relay path even starts. On-LAN the claim returns
// well inside this window.
export const LAN_CLAIM_TIMEOUT_MS = 2500;

export type InternetPairResult =
  // LAN reachable: keep today's behavior - redirect the browser into the LAN
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
// a re-render that re-runs the effect) - and each invocation that reaches the
// relay branch opens a SEPARATE rid_pair relay client with a fresh connSalt.
// The relay enforces one client per rid, so the duplicate races the first and
// ~1/3 of the time kills the winning claim (close 4409) → "Couldn't reach your
// PC." Caching the in-flight promise keyed by the pair token collapses every
// repeat call for the same attempt onto the SAME single LAN-probe + relay
// claim, so the rid_pair channel is opened exactly once. The entry is cleared
// when the promise settles so a new pair attempt (a fresh token after
// a failure, or a re-scan) starts clean.
const inFlightPairs = new Map<string, Promise<InternetPairResult>>();

/**
 * LOCAL-ORIGIN pairing: LAN-first → relay fallback for a brand-new phone.
 *
 * Used only when the page is served from the PC itself (isServedFromService).
 * A REMOTE origin does NOT call this - PairRedirect drives the tiered flow there
 * (direct navigation first, {@link pairOverRelayClaim} as the timeout fallback).
 *
 * Idempotent per pair token: concurrent or repeated calls with the same
 * `pairToken` share one in-flight attempt (one LAN probe, one relay claim).
 *
 * Decision logic:
 *   - LAN claim with a {@link LAN_CLAIM_TIMEOUT_MS} timeout:
 *       paired      → { kind: 'lan' }      (fast path, redirect to LAN panel)
 *       refused     → { kind: 'rejected' } (token expired; don't try relay -
 *                       the relay would refuse the same token)
 *       no reply    → fall through to relay
 *   - Relay claim ({@link pairOverRelayClaim}).
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

  // 1. LAN-first fast path (local origin: http→http, same network, no mixed
  //    content). The LAN claim is a plain-HTTP fetch to
  //    http://<host>:<httpPort>/panel/phone/claim; safe here because the panel
  //    is itself served over plain HTTP from the PC.
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

  // 2. Relay claim - fallback for an unreachable / timed-out / unanswered LAN
  //    claim.
  return pairOverRelayClaim(pairToken, deviceName);
}

/**
 * RELAY claim (Phase 1 internet pairing) - derive rid_pair from the QR `pair`
 * token, rendezvous with the PC over the cloud relay, send one sealed claim,
 * and get back a session token, which is stored under this origin so the panel
 * (and a later reopen of hellonexus.com) reconnects over the relay.
 *
 *   claim-ok  → store the session token, { kind: 'relay' }
 *   claim-err → { kind: 'rejected' }
 *   transport → { kind: 'unreachable' }
 *
 * Exported so the REMOTE-origin tiered flow (PairRedirect) can invoke the relay
 * as TIER 2 once the direct-LAN navigation has failed to commit. The local
 * origin reaches it via {@link runPairAttempt}'s LAN-first fallback.
 */
export async function pairOverRelayClaim(
  pairToken: string,
  deviceName: string,
): Promise<InternetPairResult> {
  try {
    // Send the stable per-device id alongside the name so the PC dedups a
    // re-pair of this same browser (replaces its session) rather than creating
    // a duplicate authorized device.
    const result = await pairOverRelay(resolveRelayWs(), pairToken, deviceName, getDeviceId());
    if (result.ok) {
      // Persist under the hellonexus.com origin so the panel - and a later
      // reopen of hellonexus.com - reconnects over the relay using this token.
      storePhoneToken(result.sessionToken);
      return { kind: 'relay', token: result.sessionToken, machineName: result.machineName, spki: result.spki };
    }
    return { kind: 'rejected', error: result.error };
  } catch {
    // Transport/handshake failure: relay disabled, no host link, network down.
    return { kind: 'unreachable' };
  }
}
