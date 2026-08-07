import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, LogIn, PowerOff } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { Overlay } from '../Overlay/Overlay';
import { SettingsSection } from '../SettingsSection/SettingsSection';
import { SettingToggle } from '../SettingRow/SettingRow';
import { Button } from '../Button/Button';
import { closeNexus2App, disableNexus2Autostart, dismissNexus2Welcome } from '../../../api/migration';
import type { Nexus2StatusResponse } from '../../../api/migration';
import { initialActionChecks, type ActionChecks } from './nexus2WelcomeUtils';
import { Nexus2ImportSection, type Nexus2ImportHandle } from './Nexus2ImportSection';
import styles from './Nexus2WelcomeScreen.module.scss';

const ACTION_ICON_SIZE = 28;

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
  const [importHasSelection, setImportHasSelection] = useState(false);
  const importHandle = useRef<Nexus2ImportHandle | null>(null);

  // Resets on every open (the component stays mounted across open toggles, per
  // Dashboard's always-rendered gating).
  useEffect(() => {
    if (!open) return;
    setActions(initialActionChecks(payload));
    setApplyPhase('idle');
    setCloseResult('idle');
    setAutostartResult('idle');
    setDismissing(false);
    setImportHasSelection(false);
  }, [open, payload]);

  if (!open) return null;

  const showCloseRow = !!payload?.running;
  const showAutostartRow = !!payload?.autostartTaskPresent;
  const hasActionsSection = showCloseRow || showAutostartRow;
  const actionsLocked = applyPhase !== 'idle';

  // Continue owns the whole flow: run the selected import first (its results
  // render in place; anything unclean keeps the screen open so the user can
  // tick the replace-layout confirm and press again), then apply the checked
  // actions in a fixed order (close before autostart). On any action failure
  // the screen stays open with inline error lines and Continue relabels to
  // "continue anyway" - a second click always dismisses, never re-attempting
  // the failed action or re-importing.
  const handleContinue = async () => {
    if (applyPhase === 'applying' || dismissing || importBusy) return;

    if (applyPhase === 'failed') {
      setDismissing(true);
      try { await dismissNexus2Welcome(); } catch { /* best-effort */ } finally { setDismissing(false); }
      onComplete();
      return;
    }

    setApplyPhase('applying');

    if (importHasSelection && importHandle.current) {
      // needsConfirm is the retryable one: the replace-layout switch appears
      // and the user presses again. A hard failure falls through to the
      // 'failed' phase so Continue offers the "anyway" exit - the screen is
      // non-dismissable, so a re-pressable import must never be the only way
      // out of it.
      const outcome = await importHandle.current.runImport();
      if (outcome === 'needsConfirm') {
        setApplyPhase('idle');
        return;
      }
      if (outcome === 'failed') {
        setApplyPhase('failed');
        return;
      }
    }

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
            <SettingToggle
              label={t('nexus2Welcome.closeApp.rowLabel')}
              description={closeAppDescription}
              icon={<PowerOff size={ACTION_ICON_SIZE} />}
              iconLeading
              checked={actions.closeApp}
              disabled={actionsLocked}
              onChange={checked => setActions(a => ({ ...a, closeApp: checked }))}
            />
          )}
          {showAutostartRow && (
            <SettingToggle
              label={t('nexus2Welcome.autostart.rowLabel')}
              description={autostartDescription}
              icon={<LogIn size={ACTION_ICON_SIZE} />}
              iconLeading
              checked={actions.disableAutostart}
              disabled={actionsLocked}
              onChange={checked => setActions(a => ({ ...a, disableAutostart: checked }))}
            />
          )}
        </SettingsSection>
      )}

      {payload?.importAvailable && (
        <Nexus2ImportSection
          open={open}
          disabled={applyPhase !== 'idle'}
          onBusyChange={setImportBusy}
          showAction={false}
          showDescription={false}
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
        <Button
          tone="accent"
          size="lg"
          onClick={handleContinue}
          loading={applyPhase === 'applying' || dismissing}
          loadingHidesLabel
          disabled={importBusy}
          className={styles.continueButton}
        >
          {applyPhase === 'failed'
            ? t('nexus2Welcome.continueAnyway')
            : importHasSelection
              ? t('nexus2Welcome.importAndContinue')
              : t('nexus2Welcome.continue')}
        </Button>
      </div>
    </Overlay>
  );
}
