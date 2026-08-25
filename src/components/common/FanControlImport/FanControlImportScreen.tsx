import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, PowerOff } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { Overlay } from '../Overlay/Overlay';
import { SettingsSection } from '../SettingsSection/SettingsSection';
import { Button } from '../Button/Button';
import {
  closeFanControlApp, disableFanControlAutostart, dismissFanControlImport,
  type FanControlStatusResponse,
} from '../../../api/fancontrol';
import { ImportCenter, type ImportCenterHandle, type ImportSourceId } from '../ImportCenter/ImportCenter';
import styles from './FanControlImportScreen.module.scss';

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

export interface FanControlImportScreenProps {
  open: boolean;
  payload: FanControlStatusResponse | null;
  onComplete: () => void;
  /** Steps back to the previous onboarding screen; the Back button only renders when provided. */
  onBack?: () => void;
}

type ApplyPhase = 'idle' | 'applying' | 'failed';

// This gate is about FanControl alone; the other sources have their own
// place in the sequence.
const FAN_CONTROL_ONLY: ImportSourceId[] = ['fancontrol'];

/**
 * One-time screen for users coming from FanControl, shown after the lighting
 * device-selection gate. Continue imports whatever is selected, then closes
 * FanControl and removes its autostart: both apps write the same PWM
 * registers, so leaving it running would have the two fighting over every fan.
 */
export function FanControlImportScreen({ open, payload, onComplete, onBack }: FanControlImportScreenProps) {
  const { t } = useTranslation();

  const [applyPhase, setApplyPhase] = useState<ApplyPhase>('idle');
  const [dismissing, setDismissing] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const [importHasSelection, setImportHasSelection] = useState(false);
  const [actionErrors, setActionErrors] = useState({ close: false, autostart: false });
  const importHandle = useRef<ImportCenterHandle | null>(null);

  // Resets on every open; the component stays mounted across open toggles.
  useEffect(() => {
    if (!open) return;
    setApplyPhase('idle');
    setDismissing(false);
    setImportHasSelection(false);
    setActionErrors({ close: false, autostart: false });
  }, [open, payload]);

  if (!open) return null;

  const heading = t('fanControlImport.screen.title');

  // `runImport` is what separates the two buttons: both close FanControl and
  // remove its autostart, because the apps cannot share the fan controllers -
  // only one of them brings the configuration over.
  const handleContinue = async (runImport: boolean) => {
    if (applyPhase === 'applying' || dismissing || importBusy) return;

    // A second click after a failure always dismisses; it never retries.
    if (applyPhase === 'failed') {
      setDismissing(true);
      try { await dismissFanControlImport(); } catch { /* best-effort */ } finally { setDismissing(false); }
      onComplete();
      return;
    }

    setApplyPhase('applying');

    let importFailed = false;
    if (runImport && importHasSelection && importHandle.current) {
      importFailed = await importHandle.current.runImport() === 'failed';
    }

    // Both are idempotent (success when there was nothing to close and no
    // autostart entry), so neither branches on what detection reported.
    const closed = await runAction(closeFanControlApp);
    const autostartOff = await runAction(disableFanControlAutostart);
    setActionErrors({ close: !closed, autostart: !autostartOff });

    if (importFailed || !closed || !autostartOff) {
      setApplyPhase('failed');
      return;
    }

    setDismissing(true);
    try { await dismissFanControlImport(); } catch { /* best-effort */ } finally { setDismissing(false); }
    onComplete();
  };

  const statusParts = [
    payload?.running ? t('fanControlImport.screen.running') : null,
    payload?.autostartPresent ? t('fanControlImport.screen.autostart') : null,
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
        <p className={styles.body}>{t('fanControlImport.screen.body')}</p>
      </div>

      <SettingsSection
        className={styles.section}
        boxClassName={styles.noticeBox}
        ariaLabel={t('fanControlImport.screen.actionsTitle')}
      >
        <div className={styles.notice}>
          <span className={styles.noticeIcon} aria-hidden><PowerOff size={ACTION_ICON_SIZE} /></span>
          <div className={styles.noticeText}>
            <p className={styles.noticeTitle}>{t('fanControlImport.screen.actionsTitle')}</p>
            <p className={styles.noticeBody}>{t('fanControlImport.screen.actionsBody')}</p>
            {statusParts.length > 0 && (
              <p className={styles.noticeStatus}>{statusParts.join(STATUS_SEPARATOR)}</p>
            )}
            {actionErrors.close && (
              <p className={styles.noticeError} role="alert">{t('fanControlImport.screen.errorClose')}</p>
            )}
            {actionErrors.autostart && (
              <p className={styles.noticeError} role="alert">{t('fanControlImport.screen.errorAutostart')}</p>
            )}
          </div>
        </div>
      </SettingsSection>

      {payload?.importAvailable && (
        <ImportCenter
          open={open}
          sources={FAN_CONTROL_ONLY}
          // This screen opened because detection found the app; re-reading it
          // here could only disagree with the gate that mounted this.
          detected={{ fancontrol: { importAvailable: true, configCount: payload.configs.length } }}
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
            {t('fanControlImport.screen.skipImport')}
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
            ? t('fanControlImport.screen.continueAnyway')
            : payload?.importAvailable
              ? t('fanControlImport.screen.importAndContinue')
              : t('fanControlImport.screen.continue')}
        </Button>
      </div>
    </Overlay>
  );
}
