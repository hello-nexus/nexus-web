import type { PanelPhonePairCodeConfirmResponse } from './panel';

/** Delay between confirm polls, matching the native apps. */
export const PAIR_APPROVAL_POLL_MS = 1000;

/** How long a pending request is polled, counted on this device's clock from when the claim answered. */
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
  /** Poll window override; defaults to the request TTL. The PC's absolute expiry is not used, as clocks differ. */
  ttlMs?: number;
  confirm: (requestId: string) => Promise<PanelPhonePairCodeConfirmResponse | null>;
  /** Tells the PC to drop the request; called once, best effort, when the caller aborts. */
  cancel?: (requestId: string) => Promise<unknown>;
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
  const deadline = now() + (opts.ttlMs ?? PAIR_APPROVAL_TTL_MS);
  // Fires on the abort itself, so an in-flight confirm cannot delay the cancel.
  let cancelSent = false;
  const sendCancel = () => {
    if (cancelSent) return;
    cancelSent = true;
    void Promise.resolve(opts.cancel?.(requestId)).catch(() => { /* best effort */ });
  };
  signal?.addEventListener('abort', sendCancel, { once: true });
  try {
    return await poll();
  } finally {
    signal?.removeEventListener('abort', sendCancel);
  }

  async function poll(): Promise<PairApprovalOutcome> {
    for (;;) {
      if (signal?.aborted) { sendCancel(); return { kind: 'aborted' }; }
      const resp = await confirm(requestId);
      if (signal?.aborted) { sendCancel(); return { kind: 'aborted' }; }
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
}
