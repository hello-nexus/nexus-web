import type { PanelPhonePairCodeConfirmResponse } from './panel';

/** Native apps poll the confirm route at 1 Hz; the web claim follows suit. */
export const PAIR_APPROVAL_POLL_MS = 1000;

/** Fallback deadline when the claim carries no expiry; matches the server request TTL. */
export const PAIR_APPROVAL_TTL_MS = 60_000;

/** Error code the service returns when a client that cannot do host approval claims. */
export const PAIR_UPDATE_REQUIRED = 'update_required';

export type PairApprovalOutcome =
  | { kind: 'approved'; token: string; machineName?: string; spki?: string }
  | { kind: 'denied' }
  | { kind: 'expired' }
  | { kind: 'aborted' };

export interface PairApprovalOptions {
  requestId: string;
  /** Unix-ms expiry from the claim response. */
  expiresAt?: number;
  confirm: (requestId: string) => Promise<PanelPhonePairCodeConfirmResponse | null>;
  signal?: AbortSignal;
  intervalMs?: number;
  now?: () => number;
}

/**
 * Polls the confirm route until the host decides, the request expires, or the
 * caller aborts. A transport failure (null) keeps polling until the deadline.
 * An unknown request or an HTTPS-only refusal ends the wait as expired, since
 * nothing the phone can do will bring that request back.
 */
export async function waitForPairApproval(opts: PairApprovalOptions): Promise<PairApprovalOutcome> {
  const { requestId, confirm, signal, intervalMs = PAIR_APPROVAL_POLL_MS, now = Date.now } = opts;
  const deadline = opts.expiresAt && opts.expiresAt > 0 ? opts.expiresAt : now() + PAIR_APPROVAL_TTL_MS;
  for (;;) {
    if (signal?.aborted) return { kind: 'aborted' };
    const resp = await confirm(requestId);
    if (signal?.aborted) return { kind: 'aborted' };
    if (resp) {
      if (resp.status === 'approved' && resp.token) {
        return {
          kind: 'approved',
          token: resp.token,
          machineName: resp.machineName || undefined,
          spki: resp.spkiFingerprint || undefined,
        };
      }
      if (resp.status === 'denied') return { kind: 'denied' };
      if (resp.status === 'expired' || resp.status === 'unknown' || resp.status === 'https-required') {
        return { kind: 'expired' };
      }
    }
    if (now() >= deadline) return { kind: 'expired' };
    await new Promise<void>(resolve => {
      const timer = setTimeout(resolve, intervalMs);
      signal?.addEventListener('abort', () => { clearTimeout(timer); resolve(); }, { once: true });
    });
  }
}
