import { ArrowLeft, TriangleAlert } from 'lucide-react';
import { Overlay } from '../Overlay/Overlay';
import { Button } from '../Button/Button';
import { EmptyState } from '../EmptyState/EmptyState';
import { ConflictAppCard } from '../ConflictAppCard/ConflictAppCard';
import { SkipOnboardingButton } from '../SkipOnboardingButton/SkipOnboardingButton';
import { useTranslation } from '../../../lib/i18n';
import type { ConflictAutostartEntry, DetectedConflict } from '../../../api/conflicts';
import styles from './ConflictOnboardingScreen.module.scss';

const HERO_ICON_SIZE = 40;

export interface ConflictOnboardingScreenProps {
  open: boolean;
  conflicts: readonly DetectedConflict[];
  /** Resolved autostart entries per conflict id; an id absent here gets no startup control. */
  autostartById?: Readonly<Record<string, ConflictAutostartEntry[]>>;
  onComplete: () => void;
  /** Steps back to the previous onboarding screen; the Back button only renders when provided. */
  onBack?: () => void;
  /** Skips every remaining onboarding step; renders the top-right escape hatch when provided. */
  onSkipOnboarding?: () => void;
}

/**
 * The last onboarding gate: apps already driving the hardware Nexus is taking
 * over. Every action is per-app and explicit - continuing ends nothing and
 * clears no autostart entry, so a user who just wants past this screen keeps
 * their setup exactly as it was.
 */
export function ConflictOnboardingScreen({
  open, conflicts, autostartById, onComplete, onBack, onSkipOnboarding,
}: ConflictOnboardingScreenProps) {
  const { t } = useTranslation();
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
        {conflicts.length === 0 ? (
          <EmptyState
            icon={<TriangleAlert size={28} />}
            title={t('conflicts.onboarding.allClearTitle')}
            hint={t('conflicts.onboarding.allClearBody')}
          />
        ) : (
          <div className={styles.list}>
            {conflicts.map(conflict => (
              <div key={conflict.id} className={styles.listItem}>
                <ConflictAppCard conflict={conflict} autostart={autostartById?.[conflict.id]} />
              </div>
            ))}
          </div>
        )}
      </div>

      <div className={styles.footerRow}>
        <Button tone="accent" size="lg" onClick={onComplete} className={styles.continueButton}>
          {conflicts.length === 0
            ? t('conflicts.onboarding.continue')
            : t('conflicts.onboarding.done')}
        </Button>
      </div>
    </Overlay>
  );
}
