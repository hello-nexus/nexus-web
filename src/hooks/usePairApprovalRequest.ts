import { useCallback, useEffect, useState } from 'react';
import { useTopicCallback } from './useMultiplexSocket';
import { useTranslation } from '../lib/i18n';
import {
  decidePanelPhonePairCode,
  type PanelPhonePairCodeRequestFrame,
} from '../api/panel';

export interface PairApprovalRequest {
  /** The pending request, or null when nothing awaits a decision. */
  active: PanelPhonePairCodeRequestFrame | null;
  busy: boolean;
  error: string | null;
  decide: (approved: boolean) => Promise<void>;
}

/**
 * The host side of the numeric-comparison pairing prompt: follows the
 * `panel/phone/pair-code/request` topic and holds the one pending request.
 * Shared by the desktop modal and the touch-panel pairing slideout so both
 * clear on the same signals: any cancelled frame for the request (the service
 * sends one whoever decided), a successful decide call, or the request's TTL.
 */
export function usePairApprovalRequest(enabled: boolean): PairApprovalRequest {
  const { t } = useTranslation();
  const [active, setActive] = useState<PanelPhonePairCodeRequestFrame | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFrame = useCallback((raw: unknown) => {
    const frame = raw as PanelPhonePairCodeRequestFrame | null;
    if (!frame || typeof frame.kind !== 'string') return;
    if (frame.kind === 'request') {
      setActive(frame);
      setBusy(false);
      setError(null);
    } else if (frame.kind === 'cancelled') {
      // Phone hung up / TTL expired / superseded / decided on another screen.
      // Drop the prompt regardless of reason; if the host hadn't decided yet
      // the server treats it as denied.
      setActive(curr => (curr && curr.requestId === frame.requestId ? null : curr));
    }
  }, []);

  useTopicCallback('panel/phone/pair-code/request', enabled, handleFrame);

  // A prompt must not outlive the surface that can answer it.
  useEffect(() => {
    if (!enabled) setActive(null);
  }, [enabled]);

  const decide = useCallback(async (approved: boolean) => {
    if (!active || busy) return;
    setBusy(true);
    setError(null);
    try {
      const resp = await decidePanelPhonePairCode(active.requestId, approved);
      if (!resp) {
        setError(t('phonePair.code.errorDecide'));
        return;
      }
      // Any terminal status clears the prompt. Server tracks the rest of
      // the handshake from the phone side.
      setActive(null);
    } catch {
      // postService can throw on transient network failure. Keep the
      // prompt open so the user can retry; the server's TTL eventually
      // garbage-collects the request if no decision lands.
      setError(t('phonePair.code.errorDecide'));
    } finally {
      setBusy(false);
    }
  }, [active, busy, t]);

  // Auto-expire the displayed prompt at the request's TTL so it doesn't
  // sit forever if the WS cancel event is missed.
  useEffect(() => {
    if (!active) return;
    const ttlMs = Math.max(0, active.expiresAt - Date.now());
    if (ttlMs === 0) {
      setActive(null);
      return;
    }
    const id = setTimeout(() => setActive(null), ttlMs);
    return () => clearTimeout(id);
  }, [active]);

  return { active, busy, error, decide };
}
