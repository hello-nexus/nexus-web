import { useState } from 'react';
import { useTranslation } from '../../../lib/i18n';
import { Overlay } from '../Overlay/Overlay';
import { SettingsSection } from '../SettingsSection/SettingsSection';
import { SettingRow } from '../SettingRow/SettingRow';
import { Button } from '../Button/Button';
import { NexusWordmark } from '../../icons/NexusBrand';
import { dismissNexus2Welcome, disableNexus2Autostart } from '../../../api/migration';
import type { Nexus2StatusResponse } from '../../../api/migration';
import styles from './Nexus2WelcomeScreen.module.scss';

export interface Nexus2WelcomeScreenProps {
  open: boolean;
  payload: Nexus2StatusResponse | null;
  onComplete: () => void;
}

type AutostartState = 'idle' | 'busy' | 'success' | 'error';

/**
 * One-time returning-user screen for HYTE Nexus 2 owners, shown after the
 * onboarding WelcomeScreen completes. Non-dismissable: Continue is the only
 * way through. Text-only HYTE Nexus 2 references - no HYTE logo/branding.
 */
export function Nexus2WelcomeScreen({ open, payload, onComplete }: Nexus2WelcomeScreenProps) {
  const { t } = useTranslation();
  const [autostartState, setAutostartState] = useState<AutostartState>('idle');
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  const handleDisableAutostart = async () => {
    if (autostartState === 'busy' || autostartState === 'success') return;
    setAutostartState('busy');
    try {
      const res = await disableNexus2Autostart();
      setAutostartState(res && !res.error ? 'success' : 'error');
    } catch {
      setAutostartState('error');
    }
  };

  // Deviates from WelcomeScreen's handleEnter (which stays open on a failed
  // write): a failed dismiss here must not trap the user behind this screen,
  // so it closes regardless of the response.
  const handleContinue = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await dismissNexus2Welcome();
    } catch {
      /* best-effort: closing must not depend on the dismiss write succeeding */
    } finally {
      setSubmitting(false);
    }
    onComplete();
  };

  const autostartDescription = autostartState === 'success'
    ? t('nexus2Welcome.autostart.success')
    : autostartState === 'error'
      ? <span className={styles.autostartError}>{t('nexus2Welcome.autostart.error')}</span>
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

      {payload?.autostartTaskPresent && (
        <SettingsSection className={styles.section}>
          <SettingRow
            label={t('nexus2Welcome.autostart.rowLabel')}
            description={autostartDescription}
          >
            <Button
              tone="neutral"
              size="sm"
              loading={autostartState === 'busy'}
              loadingHidesLabel
              disabled={autostartState === 'success'}
              onClick={handleDisableAutostart}
            >
              {t('nexus2Welcome.autostart.action')}
            </Button>
          </SettingRow>
        </SettingsSection>
      )}

      <Button
        tone="accent"
        size="lg"
        onClick={handleContinue}
        loading={submitting}
        loadingHidesLabel
        className={styles.continueButton}
      >
        {t('nexus2Welcome.continue')}
      </Button>
    </Overlay>
  );
}
