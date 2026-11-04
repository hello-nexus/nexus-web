import { Overlay } from '../components/common/Overlay/Overlay';
import { Button } from '../components/common/Button/Button';
import { usePairApprovalRequest } from '../hooks/usePairApprovalRequest';
import { useTranslation } from '../lib/i18n';
import styles from './IncomingPairModal.module.scss';

export interface PairPromptBodyProps {
  sas: string;
  deviceLabel: string;
  remoteAddress?: string;
  busy?: boolean;
  error?: string | null;
  /** Larger action buttons for touch panels. */
  touch?: boolean;
  onDecide: (approved: boolean) => void;
}

export function PairPromptBody({ sas, deviceLabel, remoteAddress, busy = false, error = null, touch = false, onDecide }: PairPromptBodyProps) {
  const { t } = useTranslation();
  return (
    <>
      <p className={styles.eyebrow}>{t('phonePair.code.requestSubtitle')}</p>
      <div className={styles.sas}>{sas}</div>
      <p className={styles.meta}>
        {t('phonePair.code.requestTitle', { device: deviceLabel })}
        {remoteAddress
          ? ` - ${t('phonePair.code.requestFrom', { ip: remoteAddress })}`
          : ''}
      </p>
      {error && <p className={styles.error}>{error}</p>}
      <div className={styles.actions}>
        <Button tone="neutral" size={touch ? 'lg' : 'md'} disabled={busy} onClick={() => onDecide(false)}>
          {t('phonePair.code.deny')}
        </Button>
        <Button tone="accent" size={touch ? 'lg' : 'md'} disabled={busy} onClick={() => onDecide(true)}>
          {t('phonePair.code.allow')}
        </Button>
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
  const { active, busy, error, decide } = usePairApprovalRequest(true);

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
