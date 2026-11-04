import { postService } from '../api/service';
import { downloadSupportBundle } from '../api/diagnostics';

/** Host actions the web host performs itself because the result is a browser download. */
export const SUPPORT_BUNDLE_ACTION = 'diagnostics.supportBundle';

interface AppDispatchOptions {
  appId: string;
  /** The manifest's capabilities.dispatch allowlist; a host-handled action runs only when listed. */
  allowed: readonly string[];
  /** Called when the support bundle download fails. */
  onSupportBundleFailed?: () => void;
}

// The service rate-limits a bundle per app; the web host runs it itself, so it gates the same way.
const BUNDLE_COOLDOWN_MS = 30_000;
interface BundleGate { inflight: Promise<unknown> | null; until: number }
const bundleGates = new Map<string, BundleGate>();

/** Test seam: forget every app's in-flight bundle and cooldown. */
export function _resetSupportBundleGatesForTests(): void {
  bundleGates.clear();
}

/**
 * Builds the host dispatch for one app. diagnostics.supportBundle is handled
 * here (same download as the Diagnostics page button); every other action goes
 * to the service. Both resolve the { ok, result } envelope.
 */
export function createAppDispatch({ appId, allowed, onSupportBundleFailed }: AppDispatchOptions) {
  return async (action: string, args?: Record<string, unknown>): Promise<unknown> => {
    if (action === SUPPORT_BUNDLE_ACTION) {
      if (!allowed.includes(action)) return { ok: false, error: `action '${action}' not in manifest allowlist` };
      const gate = bundleGates.get(appId) ?? { inflight: null, until: 0 };
      bundleGates.set(appId, gate);
      // A call while one runs shares its result; after a saved bundle a cooldown refuses quietly.
      if (gate.inflight) return gate.inflight;
      if (Date.now() < gate.until) return { ok: false, error: 'cooldown' };
      gate.inflight = (async () => {
        const saved = await downloadSupportBundle();
        if (!saved) {
          onSupportBundleFailed?.();
          return { ok: false, error: 'support bundle download failed' };
        }
        gate.until = Date.now() + BUNDLE_COOLDOWN_MS;
        return { ok: true, result: { saved: true } };
      })().finally(() => { gate.inflight = null; });
      return gate.inflight;
    }
    return postService<unknown>('/apps-api/dispatch', { appId, action, args: args ?? {} });
  };
}
