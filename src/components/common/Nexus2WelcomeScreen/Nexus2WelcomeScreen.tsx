import { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { Overlay } from '../Overlay/Overlay';
import { SettingsSection } from '../SettingsSection/SettingsSection';
import { SettingRow } from '../SettingRow/SettingRow';
import { Button } from '../Button/Button';
import { NexusWordmark } from '../../icons/NexusBrand';
import { closeNexus2App, disableNexus2Autostart, dismissNexus2Welcome } from '../../../api/migration';
import type { Nexus2StatusResponse } from '../../../api/migration';
import { initialActionChecks, type ActionChecks } from './nexus2WelcomeUtils';
import { Nexus2ImportSection } from './Nexus2ImportSection';
import styles from './Nexus2WelcomeScreen.module.scss';

export interface Nexus2WelcomeScreenProps {
  open: boolean;
  payload: Nexus2StatusResponse | null;
  onComplete: () => void;
  /** Steps back to the previous onboarding screen; the Back button only renders when provided. */
  onBack?: () => void;
}

type ActionResult = 'idle' | 'success' | 'error';
type ApplyPhase = 'idle' | 'applying' | 'failed';

/**
 * One-time returning-user screen for Nexus 2.0 owners, shown after the
 * onboarding WelcomeScreen completes. Non-dismissable: Continue is the only
 * way through. Text-only Nexus 2.0 references - no HYTE logo/branding.
 * Self-contained: open/completion flow entirely through props, no shared
 * state with any sibling post-onboarding screen.
 */
export function Nexus2WelcomeScreen({ open, payload, onComplete, onBack }: Nexus2WelcomeScreenProps) {
  const { t } = useTranslation();

  const [actions, setActions] = useState<ActionChecks>({ closeApp: false, disableAutostart: false });
  const [closeResult, setCloseResult] = useState<ActionResult>('idle');
  const [autostartResult, setAutostartResult] = useState<ActionResult>('idle');
  const [applyPhase, setApplyPhase] = useState<ApplyPhase>('idle');
  const [dismissing, setDismissing] = useState(false);
  const [importBusy, setImportBusy] = useState(false);

  // Resets on every open (the component stays mounted across open toggles, per
  // Dashboard's always-rendered gating).
  useEffect(() => {
    if (!open) return;
    setActions(initialActionChecks(payload));
    setApplyPhase('idle');
    setCloseResult('idle');
    setAutostartResult('idle');
    setDismissing(false);
  }, [open, payload]);

  if (!open) return null;

  const showCloseRow = !!payload?.running;
  const showAutostartRow = !!payload?.autostartTaskPresent;
  const hasActionsSection = showCloseRow || showAutostartRow;
  const actionsLocked = applyPhase !== 'idle';

  // Applies the checked actions in a fixed order (close before autostart) on
  // Continue. On any failure the screen stays open with inline error lines
  // and Continue relabels to "continue anyway" - a second click always
  // dismisses, it never re-attempts the failed action. Blocked while an
  // import is in flight so the screen never closes out from under a pending
  // import result.
  const handleContinue = async () => {
    if (applyPhase === 'applying' || dismissing || importBusy) return;

    if (applyPhase === 'failed') {
      setDismissing(true);
      try { await dismissNexus2Welcome(); } catch { /* best-effort */ } finally { setDismissing(false); }
      onComplete();
      return;
    }

    setApplyPhase('applying');
    let hadFailure = false;

    if (actions.closeApp) {
      const res = await closeNexus2App();
      const ok = !!res && !res.error;
      setCloseResult(ok ? 'success' : 'error');
      if (!ok) hadFailure = true;
    }
    if (actions.disableAutostart) {
      const res = await disableNexus2Autostart();
      const ok = !!res && !res.error;
      setAutostartResult(ok ? 'success' : 'error');
      if (!ok) hadFailure = true;
    }

    if (hadFailure) {
      setApplyPhase('failed');
      return;
    }

    setDismissing(true);
    try { await dismissNexus2Welcome(); } catch { /* best-effort */ } finally { setDismissing(false); }
    onComplete();
  };

  const closeAppDescription = closeResult === 'success'
    ? t('nexus2Welcome.closeApp.success')
    : closeResult === 'error'
      ? <span className={styles.actionError}>{t('nexus2Welcome.closeApp.error')}</span>
      : t('nexus2Welcome.closeApp.description');

  const autostartDescription = autostartResult === 'success'
    ? t('nexus2Welcome.autostart.success')
    : autostartResult === 'error'
      ? <span className={styles.actionError}>{t('nexus2Welcome.autostart.error')}</span>
      : t('nexus2Welcome.autostart.description');

  return (
    <Overlay
      open={open}
      onClose={() => { /* non-dismissable: only Continue proceeds */ }}
      noEscDismiss
      noBackdropDismiss
      onEnter={handleContinue}
      ariaLabel={t('nexus2Welcome.title')}
      className={styles.surface}
      backdropClassName={styles.backdrop}
    >
      <div className={styles.hero}>
        <NexusWordmark height={32} />
        <h1 className={styles.title}>{t('nexus2Welcome.title')}</h1>
        {payload?.version && (
          <p className={styles.versionDetected}>{t('nexus2Welcome.versionDetected', { version: payload.version })}</p>
        )}
        <p className={styles.body}>{t('nexus2Welcome.body')}</p>
        <p className={styles.body}>{t('nexus2Welcome.coexistence')}</p>
      </div>

      {hasActionsSection && (
        <SettingsSection className={styles.section} boxClassName={styles.actionsBox}>
          {showCloseRow && (
            <SettingRow
              label={t('nexus2Welcome.closeApp.rowLabel')}
              description={closeAppDescription}
              descriptionBelow
            >
              <input
                type="checkbox"
                className={styles.checkbox}
                aria-label={t('nexus2Welcome.closeApp.rowLabel')}
                checked={actions.closeApp}
                disabled={actionsLocked}
                onChange={e => setActions(a => ({ ...a, closeApp: e.target.checked }))}
              />
            </SettingRow>
          )}
          {showAutostartRow && (
            <SettingRow
              label={t('nexus2Welcome.autostart.rowLabel')}
              description={autostartDescription}
              descriptionBelow
            >
              <input
                type="checkbox"
                className={styles.checkbox}
                aria-label={t('nexus2Welcome.autostart.rowLabel')}
                checked={actions.disableAutostart}
                disabled={actionsLocked}
                onChange={e => setActions(a => ({ ...a, disableAutostart: e.target.checked }))}
              />
            </SettingRow>
          )}
        </SettingsSection>
      )}

      {payload?.importAvailable && (
        <Nexus2ImportSection open={open} disabled={applyPhase !== 'idle'} onBusyChange={setImportBusy} />
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
        <Button
          tone="accent"
          size="lg"
          onClick={handleContinue}
          loading={applyPhase === 'applying' || dismissing}
          loadingHidesLabel
          disabled={importBusy}
          className={styles.continueButton}
        >
          {applyPhase === 'failed' ? t('nexus2Welcome.continueAnyway') : t('nexus2Welcome.continue')}
        </Button>
      </div>
    </Overlay>
  );
}
