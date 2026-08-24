import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, PowerOff } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { Overlay } from '../Overlay/Overlay';
import { SettingsSection } from '../SettingsSection/SettingsSection';
import { Button } from '../Button/Button';
import { closeNexus2App, disableNexus2Autostart, dismissNexus2Welcome } from '../../../api/migration';
import type { Nexus2StatusResponse } from '../../../api/migration';
import { Nexus2ImportSection, type Nexus2ImportHandle } from './Nexus2ImportSection';
import styles from './Nexus2WelcomeScreen.module.scss';

const ACTION_ICON_SIZE = 28;
const STATUS_SEPARATOR = ' · ';

/** True when the request came back without an error; a throw counts as failure. */
async function runAction(call: () => Promise<{ error: boolean } | null>): Promise<boolean> {
  try {
    const res = await call();
    return !!res && !res.error;
  } catch {
    return false;
  }
}

export interface Nexus2WelcomeScreenProps {
  open: boolean;
  payload: Nexus2StatusResponse | null;
  onComplete: () => void;
  /** Steps back to the previous onboarding screen; the Back button only renders when provided. */
  onBack?: () => void;
}

type ApplyPhase = 'idle' | 'applying' | 'failed';

/**
 * One-time returning-user screen for Nexus 2 owners, shown after the
 * onboarding WelcomeScreen completes. Non-dismissable: Continue is the only
 * way through. Text-only Nexus 2 references - no HYTE logo/branding.
 * Self-contained: open/completion flow entirely through props, no shared
 * state with any sibling post-onboarding screen.
 */
export function Nexus2WelcomeScreen({ open, payload, onComplete, onBack }: Nexus2WelcomeScreenProps) {
  const { t } = useTranslation();

  const [applyPhase, setApplyPhase] = useState<ApplyPhase>('idle');
  const [dismissing, setDismissing] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const [importHasSelection, setImportHasSelection] = useState(false);
  const [actionErrors, setActionErrors] = useState({ close: false, autostart: false });
  const importHandle = useRef<Nexus2ImportHandle | null>(null);

  // Resets on every open (the component stays mounted across open toggles, per
  // Dashboard's always-rendered gating).
  useEffect(() => {
    if (!open) return;
    setApplyPhase('idle');
    setDismissing(false);
    setImportHasSelection(false);
    setActionErrors({ close: false, autostart: false });
  }, [open, payload]);

  if (!open) return null;

  // Continue owns the whole flow: run the selected import, then always close
  // Nexus 2 and remove its autostart. Anything that fails leaves the screen
  // open with the reason inline and relabels Continue to "continue anyway" -
  // a second click always dismisses, never re-attempting.
  // `runImport` is what separates the two buttons: both close Nexus 2 and
  // remove its autostart either way, since it holds the same hardware - only
  // one of them brings the personalization over.
  const handleContinue = async (runImport: boolean) => {
    if (applyPhase === 'applying' || dismissing || importBusy) return;

    if (applyPhase === 'failed') {
      setDismissing(true);
      try { await dismissNexus2Welcome(); } catch { /* best-effort */ } finally { setDismissing(false); }
      onComplete();
      return;
    }

    setApplyPhase('applying');

    // The import is independent of the coexistence actions, so a failed one
    // must not skip them: dismissing latches the gate closed service-side,
    // and leaving Nexus 2 running and autostarting is the single thing this
    // screen promises unconditionally.
    let importFailed = false;
    if (runImport && importHasSelection && importHandle.current) {
      importFailed = await importHandle.current.runImport() === 'failed';
    }

    // Both ops are idempotent - success when there was nothing to close and
    // no task to remove - so neither branches on what detection reported.
    const closeOk = await runAction(closeNexus2App);
    const autostartOk = await runAction(disableNexus2Autostart);
    setActionErrors({ close: !closeOk, autostart: !autostartOk });

    if (importFailed || !closeOk || !autostartOk) {
      setApplyPhase('failed');
      return;
    }

    setDismissing(true);
    try { await dismissNexus2Welcome(); } catch { /* best-effort */ } finally { setDismissing(false); }
    onComplete();
  };

  // The detected version IS the heading; the version-less title is the
  // fallback for a detection that could not read one.
  const heading = payload?.version
    ? t('nexus2Welcome.versionDetected', { version: payload.version })
    : t('nexus2Welcome.title');

  // Detected state is informational only - the actions run either way.
  const statusParts = [
    payload?.running ? t('nexus2Welcome.actions.running') : null,
    payload?.autostartTaskPresent ? t('nexus2Welcome.actions.autostart') : null,
  ].filter(Boolean);

  return (
    <Overlay
      open={open}
      onClose={() => { /* non-dismissable: only Continue proceeds */ }}
      noEscDismiss
      noBackdropDismiss
      onEnter={() => handleContinue(true)}
      ariaLabel={heading}
      className={styles.surface}
      backdropClassName={styles.backdrop}
    >
      <div className={styles.hero}>
        <h1 className={styles.title}>{heading}</h1>
        <p className={styles.body}>{t('nexus2Welcome.body')}</p>
      </div>

      <SettingsSection
        className={styles.section}
        boxClassName={styles.noticeBox}
        ariaLabel={t('nexus2Welcome.actions.title')}
      >
        <div className={styles.notice}>
          <span className={styles.noticeIcon} aria-hidden><PowerOff size={ACTION_ICON_SIZE} /></span>
          <div className={styles.noticeText}>
            <p className={styles.noticeTitle}>{t('nexus2Welcome.actions.title')}</p>
            <p className={styles.noticeBody}>{t('nexus2Welcome.actions.body')}</p>
            {statusParts.length > 0 && (
              <p className={styles.noticeStatus}>{statusParts.join(STATUS_SEPARATOR)}</p>
            )}
            {actionErrors.close && (
              <p className={styles.noticeError} role="alert">{t('nexus2Welcome.actions.errorClose')}</p>
            )}
            {actionErrors.autostart && (
              <p className={styles.noticeError} role="alert">{t('nexus2Welcome.actions.errorAutostart')}</p>
            )}
          </div>
        </div>
      </SettingsSection>

      {payload?.importAvailable && (
        <Nexus2ImportSection
          open={open}
          disabled={applyPhase !== 'idle'}
          onBusyChange={setImportBusy}
          showAction={false}
          onSelectionChange={setImportHasSelection}
          handleRef={importHandle}
        />
      )}

      <div className={styles.footerRow}>
        {onBack && (
          <Button
            tone="ghost"
            size="lg"
            icon={<ArrowLeft />}
            disabled={applyPhase === 'applying' || dismissing || importBusy}
            onClick={onBack}
          >
            {t('nav.back')}
          </Button>
        )}
        {applyPhase !== 'failed' && payload?.importAvailable && (
          <Button
            tone="neutral"
            size="lg"
            onClick={() => handleContinue(false)}
            disabled={applyPhase === 'applying' || dismissing || importBusy}
            className={styles.continueButton}
          >
            {t('nexus2Welcome.skipImport')}
          </Button>
        )}
        <Button
          tone="accent"
          size="lg"
          onClick={() => handleContinue(true)}
          loading={applyPhase === 'applying' || dismissing}
          loadingHidesLabel
          disabled={importBusy || (applyPhase !== 'failed' && payload?.importAvailable === true && !importHasSelection)}
          className={styles.continueButton}
        >
          {applyPhase === 'failed'
            ? t('nexus2Welcome.continueAnyway')
            : payload?.importAvailable
              ? t('nexus2Welcome.importAndContinue')
              : t('nexus2Welcome.continue')}
        </Button>
      </div>
    </Overlay>
  );
}
