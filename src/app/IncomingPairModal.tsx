import { useCallback, useEffect, useState } from 'react';
import { Overlay } from '../components/common/Overlay/Overlay';
import { useTopicCallback } from '../hooks/useMultiplexSocket';
import { useTranslation } from '../lib/i18n';
import {
  decidePanelPhonePairCode,
  type PanelPhonePairCodeRequestFrame,
} from '../api/panel';
import styles from './IncomingPairModal.module.scss';

export interface PairPromptBodyProps {
  sas: string;
  deviceLabel: string;
  remoteAddress?: string;
  busy?: boolean;
  error?: string | null;
  onDecide: (approved: boolean) => void;
}

function PairPromptBody({ sas, deviceLabel, remoteAddress, busy = false, error = null, onDecide }: PairPromptBodyProps) {
  const { t } = useTranslation();
  return (
    <>
      <p className={styles.eyebrow}>{t('phonePair.code.requestSubtitle')}</p>
      <div className={styles.sas}>{sas}</div>
      <p className={styles.meta}>
        {t('phonePair.code.requestTitle', { device: deviceLabel })}
        {remoteAddress
          ? ` · ${t('phonePair.code.requestFrom', { ip: remoteAddress })}`
          : ''}
      </p>
      {error && <p className={styles.error}>{error}</p>}
      <div className={styles.actions}>
        <button
          type="button"
          disabled={busy}
          onClick={() => onDecide(false)}
          className={styles.denyBtn}
        >
          {t('phonePair.code.deny')}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => onDecide(true)}
          className={styles.allowBtn}
        >
          {t('phonePair.code.allow')}
        </button>
      </div>
    </>
  );
}

/**
 * The numeric-comparison prompt as a plain card, no backdrop and no service
 * wiring: for demo/marketing embeds that mount it with static props. The live
 * dashboard prompt is IncomingPairModal below.
 */
export function IncomingPairCard(props: PairPromptBodyProps) {
  return (
    <div className={styles.modal}>
      <PairPromptBody {...props} />
    </div>
  );
}

/**
 * Global numeric-comparison prompt. Subscribes to the
 * `panel/phone/pair-code/request` WS topic at the dashboard root and pops
 * a mini modal - the 6-digit pairing number plus Allow and Deny - whenever
 * a phone submits a code or initiates a Wi-Fi pair.
 *
 * Separate from the Pair Remote modal so it surfaces regardless of section,
 * and forces an explicit Allow / Deny (no X / Esc / backdrop-click dismiss)
 * rather than leaving a pair request hanging.
 */
export function IncomingPairModal() {
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
      // Phone hung up / TTL expired / superseded by a new pair-code/start.
      // Drop the prompt regardless of reason; if the host hadn't decided yet
      // the server treats it as denied.
      setActive(curr => (curr && curr.requestId === frame.requestId ? null : curr));
    }
  }, []);

  useTopicCallback('panel/phone/pair-code/request', true, handleFrame);

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

  if (!active) return null;

  const deviceLabel = active.deviceLabel || t('phonePair.deviceFallback');

  return (
    <Overlay
      open
      onClose={() => { /* must explicitly Allow or Deny */ }}
      variant="alert"
      noEscDismiss
      noBackdropDismiss
      ariaLabel={t('phonePair.code.requestTitle', { device: deviceLabel })}
      className={styles.modal}
    >
      <PairPromptBody
        sas={active.sas}
        deviceLabel={deviceLabel}
        remoteAddress={active.remoteAddress}
        busy={busy}
        error={error}
        onDecide={approved => void decide(approved)}
      />
    </Overlay>
  );
}
