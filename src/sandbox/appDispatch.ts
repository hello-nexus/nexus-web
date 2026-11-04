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

/**
 * Builds the host dispatch for one app. diagnostics.supportBundle is handled
 * here (same download as the Diagnostics page button); every other action goes
 * to the service. Both resolve the { ok, result } envelope.
 */
export function createAppDispatch({ appId, allowed, onSupportBundleFailed }: AppDispatchOptions) {
  return async (action: string, args?: Record<string, unknown>): Promise<unknown> => {
    if (action === SUPPORT_BUNDLE_ACTION) {
      if (!allowed.includes(action)) return { ok: false, error: `action '${action}' not in manifest allowlist` };
      const saved = await downloadSupportBundle();
      if (!saved) {
        onSupportBundleFailed?.();
        return { ok: false, error: 'support bundle download failed' };
      }
      return { ok: true, result: { saved: true } };
    }
    return postService<unknown>('/apps-api/dispatch', { appId, action, args: args ?? {} });
  };
}
