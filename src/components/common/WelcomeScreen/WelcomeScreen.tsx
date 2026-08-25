import { useEffect, useState } from 'react';
import { Activity, Lightbulb, Fan, LayoutGrid, Smartphone, Heart, type LucideIcon } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { Overlay } from '../Overlay/Overlay';
import { SettingsSection } from '../SettingsSection/SettingsSection';
import { SettingToggle } from '../SettingRow/SettingRow';
import { Button } from '../Button/Button';
import { HeartBurst, useHeartBurstTrigger } from '../HeartBurst/HeartBurst';
import { HoverTooltip } from '../HoverTooltip/HoverTooltip';
import { PlatformIcon } from '../../icons/PlatformIcons';
import { NexusWordmark } from '../../icons/NexusBrand';
import { buildTelemetryConsentDescription } from '../../../lib/telemetryConsent';
import { postService } from '../../../api/service';
import { fetchTelemetryConsent } from '../../../api/telemetry';
import { completeOnboarding } from '../../../api/onboarding';
import { setAutoStart } from '../../../api/autoStart';
import { getUpdateStatus } from '../../../api/update';
import styles from './WelcomeScreen.module.scss';

export interface WelcomeScreenProps {
  open: boolean;
  // Ping's reported OS, drives the platform-aware start-with-OS label.
  platform: string;
  onComplete: () => void;
}

const CAPABILITY_ICON_SIZE = 20;

// Quiet summary row under the heading. Icons + copy are borrowed from where
// each capability already lives (sidebar nav for monitoring/lighting/cooling,
// the sidebar Apps section for widget personalization, Pair Remote for phone
// access) so the welcome screen doesn't introduce a second icon vocabulary.
const CAPABILITIES: readonly { Icon: LucideIcon; key: string }[] = [
  { Icon: Activity, key: 'welcome.capabilities.monitoring' },
  { Icon: Lightbulb, key: 'welcome.capabilities.lighting' },
  { Icon: Fan, key: 'welcome.capabilities.cooling' },
  { Icon: LayoutGrid, key: 'welcome.capabilities.widgets' },
  { Icon: Smartphone, key: 'welcome.capabilities.remote' },
];

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
  // null until seeded, so useHeartBurstTrigger treats the load as baseline, not a transition to animate.
  const [telemetryOn, setTelemetryOn] = useState<boolean | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(false);
  const [currentVersion, setCurrentVersion] = useState('');
  const burstKey = useHeartBurstTrigger(telemetryOn);

  // Same source as the "check for updates" modal (getUpdateStatus -> /update/status).
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    getUpdateStatus().then(s => {
      if (s && !cancelled) setCurrentVersion(s.currentVersion);
    });
    return () => { cancelled = true; };
  }, [open]);

  // Seeds from service truth: on for a fresh default-on install, off for an upgrader who declined; false on any fetch failure.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetchTelemetryConsent().then(res => {
      if (!cancelled) setTelemetryOn(res?.enabled ?? false);
    });
    return () => { cancelled = true; };
  }, [open]);

  if (!open) return null;

  // setAutoStart is /service/startup-mode - the same control GeneralTab's
  // Settings toggle drives (Windows SCM start type; Linux systemd unit
  // enablement). No macOS equivalent exists yet, so the toggle there is a
  // known no-op.
  const showStartWithOs = platform === 'windows' || platform === 'macos' || platform === 'linux';
  const startLabel = platform === 'macos'
    ? t('welcome.startAtLogin.label')
    : t('welcome.startWithOs.label');

  const handleEnter = async () => {
    if (submitting) return;
    setSubmitting(true);
    setError(false);
    try {
      await Promise.all([
        postService('/telemetry/consent', { enabled: telemetryOn ?? false }),
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
      autoFocus="container"
      ariaLabel={t('welcome.title')}
      className={styles.surface}
      backdropClassName={styles.backdrop}
    >
      <div className={styles.hero}>
        <img src="/nexus-mark-color.png" alt="" width={140} height={140} className={styles.logo} />
        <div className={styles.brandGroup}>
          <NexusWordmark height={40} />
          {currentVersion && <p className={styles.version}>{currentVersion}</p>}
        </div>
        <div className={styles.capabilitiesGroup}>
          <div className={styles.capabilities}>
            {CAPABILITIES.map(({ Icon, key }) => (
              <HoverTooltip key={key} body={t(key)}>
                <span className={styles.capabilityIcon} tabIndex={0} role="img" aria-label={t(key)}>
                  <Icon size={CAPABILITY_ICON_SIZE} />
                </span>
              </HoverTooltip>
            ))}
          </div>
          <p className={styles.tagline}>{t('welcome.tagline')}</p>
        </div>
      </div>

      <SettingsSection className={styles.section}>
        {showStartWithOs && (
          <SettingToggle
            label={startLabel}
            description={t('welcome.startWithOs.description')}
            icon={<PlatformIcon platform={platform} />}
            iconLeading
            checked={startWithOs}
            onChange={setStartWithOsValue}
            disabled={submitting}
          />
        )}
        {telemetryOn !== null && (
          <div className={styles.telemetryRow}>
            <SettingToggle
              label={t('settings.telemetry.label')}
              icon={<Heart />}
              iconLeading
              description={buildTelemetryConsentDescription(t)}
              checked={telemetryOn}
              onChange={setTelemetryOn}
              disabled={submitting}
            />
            <HeartBurst burstKey={burstKey} originTop={24} />
          </div>
        )}
      </SettingsSection>
      <p className={styles.hint}>{t('welcome.preferences.hint')}</p>

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
