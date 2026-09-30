import type { StoreInstallResult } from '../../../api/store';

/** Returned when the user cancels the consent dialog; nothing was installed. */
export const CONSENT_DECLINED = 'consent_declined';

/**
 * Runs an install, and when the service answers consent_required asks the user
 * and resends with exactly the grants the service listed. `run` receives the
 * approved grants on the second call only.
 */
export async function installWithConsent(
  run: (approvedCapabilities?: string[]) => Promise<StoreInstallResult | null>,
  ask: (requested: string[]) => Promise<boolean>,
): Promise<StoreInstallResult | null> {
  const first = await run();
  if (first?.reason !== 'consent_required' || !first.requestedCapabilities) return first;
  const requested = first.requestedCapabilities;
  if (!(await ask(requested))) return { ...first, ok: false, reason: CONSENT_DECLINED };
  return run(requested);
}
