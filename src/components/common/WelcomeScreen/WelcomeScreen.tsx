import { useState } from 'react';
import { useTranslation } from '../../../lib/i18n';
import { Overlay } from '../Overlay/Overlay';
import { NexusMark } from '../../icons/NexusBrand';
import { SettingsSection } from '../SettingsSection/SettingsSection';
import { SettingToggle } from '../SettingRow/SettingRow';
import { Button } from '../Button/Button';
import { HeartBurst, useHeartBurstTrigger } from '../HeartBurst/HeartBurst';
import { buildTelemetryConsentDescription } from '../../../lib/telemetryConsent';
import { postService } from '../../../api/service';
import { completeOnboarding } from '../../../api/onboarding';
import { setAutoStart } from '../../../api/autoStart';
import styles from './WelcomeScreen.module.scss';

export interface WelcomeScreenProps {
  open: boolean;
  // Ping's reported OS, drives the platform-aware start-with-OS label.
  platform: string;
  onComplete: () => void;
}

/**
 * First-run gate on the desktop dashboard. Non-dismissable: the Enter button
 * (or the Enter key, via Overlay's onEnter) is the only way through. The
 * telemetry/autostart writes are best-effort; onboarding is only marked
 * complete (and the gate dismissed) once completeOnboarding itself succeeds,
 * so a failed write can never strand the gate open with no way forward and
 * can never silently mark a failed save as done.
 */
export function WelcomeScreen({ open, platform, onComplete }: WelcomeScreenProps) {
  const { t } = useTranslation();
  const [startWithOs, setStartWithOsValue] = useState(true);
  const [telemetryOn, setTelemetryOn] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(false);
  const burstKey = useHeartBurstTrigger(telemetryOn);

  if (!open) return null;

  // setAutoStart is the Windows SCM-backed /service/startup-mode - the same
  // control GeneralTab's Settings toggle drives on Windows. No macOS
  // equivalent exists yet, so the toggle there is a known no-op.
  const showStartWithOs = platform === 'windows' || platform === 'macos';
  const startLabel = platform === 'macos'
    ? t('welcome.startAtLogin.label')
    : t('welcome.startWithOs.label');

  const handleEnter = async () => {
    if (submitting) return;
    setSubmitting(true);
    setError(false);
    try {
      await Promise.all([
        postService('/telemetry/consent', { enabled: telemetryOn }),
        showStartWithOs ? setAutoStart(startWithOs) : null,
      ]);
      const result = await completeOnboarding();
      if (result?.completed) {
        onComplete();
      } else {
        setError(true);
      }
    } catch {
      setError(true);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Overlay
      open={open}
      onClose={() => { /* non-dismissable: only the Enter button proceeds */ }}
      noEscDismiss
      noBackdropDismiss
      onEnter={handleEnter}
      ariaLabel={t('welcome.title')}
      className={styles.surface}
    >
      <div className={styles.hero}>
        <NexusMark size={72} />
        <h1 className={styles.title}>{t('welcome.title')}</h1>
        <p className={styles.tagline}>{t('welcome.tagline')}</p>
      </div>

      <SettingsSection title={t('welcome.preferences.title')} className={styles.section}>
        {showStartWithOs && (
          <SettingToggle
            label={startLabel}
            checked={startWithOs}
            onChange={setStartWithOsValue}
            disabled={submitting}
          />
        )}
        <div className={styles.telemetryRow}>
          <SettingToggle
            label={t('welcome.telemetry.label')}
            description={buildTelemetryConsentDescription(t)}
            checked={telemetryOn}
            onChange={setTelemetryOn}
            disabled={submitting}
          />
          <HeartBurst burstKey={burstKey} />
        </div>
      </SettingsSection>

      {error && <p className={styles.error}>{t('welcome.error')}</p>}

      <Button
        tone="accent"
        size="lg"
        onClick={handleEnter}
        loading={submitting}
        loadingHidesLabel
        className={styles.enterButton}
      >
        {t('welcome.enter')}
      </Button>
    </Overlay>
  );
}
