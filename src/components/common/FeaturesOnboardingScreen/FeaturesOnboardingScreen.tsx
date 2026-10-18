import { useState } from 'react';
import { ArrowLeft, Activity, Ban, Check, Fan, Lightbulb, SlidersHorizontal, Stethoscope, type LucideIcon } from 'lucide-react';
import { SkipOnboardingButton } from '../SkipOnboardingButton/SkipOnboardingButton';
import { useTranslation } from '../../../lib/i18n';
import { Overlay } from '../Overlay/Overlay';
import { Button } from '../Button/Button';
import { completeFeaturesOnboarding, completeLightingOnboarding } from '../../../api/onboarding';
import { savePreferences } from '../../../api/profiles';
import { useFeatureFlags, useUiSettingsHydrated, useUiSettingsUpdateSafe, type FeatureFlags, type FeatureKey } from '../../../hooks/useUiSettings';
import { OnboardingNote } from '../OnboardingNote/OnboardingNote';
import styles from './FeaturesOnboardingScreen.module.scss';

export interface FeaturesOnboardingScreenProps {
  /** Skips every remaining onboarding step; renders the top-right escape hatch when provided. */
  onSkipOnboarding?: () => void;
  open: boolean;
  /** Replay of an already-decided install: start from the current pillars instead of all on. */
  fromCurrent?: boolean;
  onComplete: (flags: FeatureFlags) => void;
  /** Steps back to the previous onboarding screen; the Back button only renders when provided. */
  onBack?: () => void;
}

const noop = () => {};

const PILLARS: { key: FeatureKey; Icon: LucideIcon; titleKey: string }[] = [
  { key: 'lighting', Icon: Lightbulb, titleKey: 'lighting.title' },
  { key: 'cooling', Icon: Fan, titleKey: 'cooling.title' },
  { key: 'monitoring', Icon: Activity, titleKey: 'nav.monitoring' },
  { key: 'diagnostics', Icon: Stethoscope, titleKey: 'diagnostics.title' },
];

const ALL_ON: FeatureFlags = { lighting: true, cooling: true, monitoring: true, diagnostics: true };

/**
 * First onboarding gate after the welcome screen, before Import: lets the
 * user turn off whole functional pillars (Lighting, Cooling, Monitoring,
 * Diagnostics) up front rather than hunting for the switches in Settings
 * later. All four default on. Non-dismissable like WelcomeScreen; Continue
 * is the only way through, and it only dismisses once the completion flag
 * write succeeds. Turning Lighting off here also completes the lighting
 * onboarding step, so Dashboard skips the device-selection screen.
 */
export function FeaturesOnboardingScreen({ open, fromCurrent, onComplete, onBack, onSkipOnboarding }: FeaturesOnboardingScreenProps) {
  const { t } = useTranslation();
  // Only the switches the user touched; the rest keep following the base values.
  const [picked, setPicked] = useState<Partial<FeatureFlags>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(false);
  const updateUiSettings = useUiSettingsUpdateSafe();
  // A replay reads what the user has now, so Continue alone changes nothing; a fresh install stays all on.
  const current = useFeatureFlags();
  // Before the server preferences arrive, current is only the local cache and could save a pillar back on.
  const hydrated = useUiSettingsHydrated();
  const waiting = !!fromCurrent && !hydrated;
  const flags: FeatureFlags = { ...(fromCurrent ? current : ALL_ON), ...picked };

  if (!open) return null;

  const togglePillar = (key: FeatureKey) => {
    setPicked(prev => ({ ...prev, [key]: !flags[key] }));
  };

  const handleContinue = async () => {
    if (submitting || waiting) return;
    setSubmitting(true);
    setError(false);
    try {
      // Explicit true/false for all four, not only the ones the user turned
      // off: a prior write (another session, a test run) can leave the
      // server disagreeing with a pillar the user left visually on, and an
      // omitted field would keep that stale server value instead of
      // overwriting it.
      updateUiSettings({
        featureLightingEnabled: flags.lighting,
        featureCoolingEnabled: flags.cooling,
        featureMonitoringEnabled: flags.monitoring,
        featureDiagnosticsEnabled: flags.diagnostics,
      });
      // updateUiSettings debounces its server write, so completion could land
      // first and the service would treat Lighting and Cooling as off until
      // the choice arrives. Send the choice now and wait for it.
      // postService reports a failure as null instead of throwing.
      if (!(await savePreferences({ features: flags }))) {
        setError(true);
        return;
      }

      const result = await completeFeaturesOnboarding();
      if (!result?.featuresCompleted) {
        setError(true);
        return;
      }
      // A reload must not resurrect the lighting device-selection step once
      // this screen already decided lighting is off.
      if (!flags.lighting) {
        await completeLightingOnboarding().catch(() => { /* best-effort */ });
      }
      onComplete(flags);
    } catch {
      setError(true);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Overlay
      open={open}
      onClose={noop}
      noEscDismiss
      noBackdropDismiss
      onEnter={handleContinue}
      autoFocus="container"
      ariaLabel={t('featuresOnboarding.title')}
      className={styles.surface}
      backdropClassName={styles.backdrop}
    >
      <div className={styles.topBar}>
        {onBack ? (
          <Button tone="ghost" size="sm" icon={<ArrowLeft />} disabled={submitting} onClick={onBack}>
            {t('nav.back')}
          </Button>
        ) : <span />}
        {onSkipOnboarding ? <SkipOnboardingButton onSkip={onSkipOnboarding} /> : <span />}
      </div>

      <div className={styles.hero}>
        <span className={styles.heroIcon} aria-hidden>
          <SlidersHorizontal size={40} />
        </span>
        <h1 className={styles.title}>{t('featuresOnboarding.title')}</h1>
      </div>

      <div className={styles.pillarGrid} role="group" aria-label={t('featuresOnboarding.pillarsLabel')}>
        {PILLARS.map(({ key, Icon, titleKey }) => (
          <button
            key={key}
            type="button"
            role="checkbox"
            aria-checked={flags[key]}
            disabled={waiting}
            className={`${styles.pillarCard} ${flags[key] ? styles.pillarCardOn : ''}`}
            onClick={() => togglePillar(key)}
          >
            <span className={styles.pillarIndicator} aria-hidden>
              {flags[key] ? <Check /> : <Ban />}
            </span>
            <span className={`${styles.pillarIcon} ${styles[`icon_${key}`]}`} aria-hidden>
              <Icon size={56} strokeWidth={1.75} />
              {key === 'lighting' && (
                <svg className={styles.rays} viewBox="0 0 24 24" width={56} height={56} strokeWidth={1.75}>
                  <path d="M12 -2.5v1.5" />
                  <path d="M4.2 0.6l1 1" />
                  <path d="M19.8 0.6l-1 1" />
                  <path d="M1.5 7.5h1.5" />
                  <path d="M21 7.5h1.5" />
                </svg>
              )}
            </span>
            <span className={styles.pillarTitle}>{t(titleKey)}</span>
            <span className={styles.pillarDescription}>{t(`featuresOnboarding.pillar.${key}.description`)}</span>
          </button>
        ))}
      </div>

      <OnboardingNote>{t('welcome.preferences.hint')}</OnboardingNote>

      {error && <p className={styles.error}>{t('welcome.error')}</p>}

      <div className={styles.footerRow}>
        <Button
          tone="accent"
          size="lg"
          onClick={handleContinue}
          loading={submitting || waiting}
          loadingHidesLabel
          className={styles.continueButton}
        >
          {t('featuresOnboarding.continue')}
        </Button>
      </div>
    </Overlay>
  );
}
