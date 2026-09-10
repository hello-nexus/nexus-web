import { ArrowLeft, TriangleAlert } from 'lucide-react';
import { Overlay } from '../Overlay/Overlay';
import { Button } from '../Button/Button';
import { ConflictAllClear } from '../ConflictAllClear/ConflictAllClear';
import { ConflictAppCard } from '../ConflictAppCard/ConflictAppCard';
import { SkipOnboardingButton } from '../SkipOnboardingButton/SkipOnboardingButton';
import { useTranslation } from '../../../lib/i18n';
import { useConflictAutostart } from '../../../hooks/useConflictAutostart';
import { useConflictDevices } from '../../../hooks/useConflictDevices';
import { useConflictRoster } from '../../../hooks/useConflictRoster';
import type { DetectedConflict } from '../../../api/conflicts';
import styles from './ConflictOnboardingScreen.module.scss';

const HERO_ICON_SIZE = 40;

export interface ConflictOnboardingScreenProps {
  open: boolean;
  conflicts: readonly DetectedConflict[];
  /** False while the detected-app snapshot is unresolved; the roster then holds its rows instead of reading the gap as apps exiting. */
  ready: boolean;
  onComplete: () => void;
  /** Steps back to the previous onboarding screen; the Back button only renders when provided. */
  onBack?: () => void;
  /** Skips every remaining onboarding step; renders the top-right escape hatch when provided. */
  onSkipOnboarding?: () => void;
}

/**
 * The last onboarding gate: apps already driving the hardware Nexus is taking
 * over. Ending one is per-app and explicit; continuing ends nothing, so a user
 * who just wants past this screen keeps their setup exactly as it was.
 */
export function ConflictOnboardingScreen({
  open, conflicts, ready, onComplete, onBack, onSkipOnboarding,
}: ConflictOnboardingScreenProps) {
  const { t } = useTranslation();
  // Sticky rows: an app ended here stays listed as terminated, so the step
  // does not empty out under the user as they work through it.
  const { entries, conflicts: roster, markTerminated } = useConflictRoster(conflicts, open, ready);
  const { devicesByApp, setOwner } = useConflictDevices(roster, open);
  const { autostartByApp, disable: disableAutostart } = useConflictAutostart(roster, open);
  const heading = t('conflicts.onboarding.title');

  return (
    <Overlay
      open={open}
      onClose={() => { /* non-dismissable: only the footer proceeds */ }}
      noEscDismiss
      noBackdropDismiss
      onEnter={onComplete}
      // Without this the first focusable is the skip button, and a Space press
      // meant to scroll the surface would skip the whole sequence.
      autoFocus="container"
      ariaLabel={heading}
      className={styles.surface}
      backdropClassName={styles.backdrop}
    >
      <div className={styles.topBar}>
        {onBack ? (
          <Button tone="ghost" size="sm" icon={<ArrowLeft />} onClick={onBack}>
            {t('nav.back')}
          </Button>
        ) : <span />}
        {onSkipOnboarding ? <SkipOnboardingButton onSkip={onSkipOnboarding} /> : <span />}
      </div>

      <div className={styles.hero}>
        <span className={styles.heroIcon} aria-hidden>
          <TriangleAlert size={HERO_ICON_SIZE} />
        </span>
        <h1 className={styles.title}>{heading}</h1>
        <p className={styles.intro}>{t('conflicts.onboarding.intro')}</p>
      </div>

      <div className={styles.section}>
        {entries.length === 0 ? (
          <ConflictAllClear />
        ) : (
          <div className={styles.list}>
            {entries.map(entry => (
              <div key={entry.conflict.id} className={styles.listItem}>
                <ConflictAppCard
                  conflict={entry.conflict}
                  devices={devicesByApp.get(entry.conflict.id)}
                  onSetOwner={owner => setOwner(entry.conflict.id, owner)}
                  terminated={entry.terminated}
                  onTerminated={() => markTerminated(entry.conflict.id)}
                  autostart={autostartByApp.get(entry.conflict.id)}
                  onDisableAutostart={() => disableAutostart(entry.conflict.id)}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      <div className={styles.footerRow}>
        <Button tone="accent" size="lg" onClick={onComplete} className={styles.continueButton}>
          {entries.length === 0
            ? t('conflicts.onboarding.continue')
            : t('conflicts.onboarding.done')}
        </Button>
      </div>
    </Overlay>
  );
}
