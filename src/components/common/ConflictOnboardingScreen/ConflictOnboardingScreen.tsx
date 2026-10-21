import { useCallback, useMemo, useState } from 'react';
import { TriangleAlert } from 'lucide-react';
import { Overlay } from '../Overlay/Overlay';
import { ConflictOutcomePanel, type ConflictOutcomeAction } from '../ConflictOutcomePanel/ConflictOutcomePanel';
import { OnboardingHeader } from '../OnboardingHeader/OnboardingHeader';
import { useTranslation } from '../../../lib/i18n';
import { useConflictAutoKillExclusions } from '../../../hooks/useUiSettings';
import { HYTE_NEXUS2_CONFLICT_ID, type DetectedConflict } from '../../../api/conflicts';
import { reportConflictStep, type ConflictStepAction } from '../../../api/onboarding';
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
  /** Nexus 2 is installed: the screen lists it as an uninstall card, selected by default. */
  nexus2Installed?: boolean;
}

/**
 * Conflict gate, after the import step and before device selection: apps
 * already driving the hardware the next screen enumerates. Each app is a card
 * the user flips between terminate and keep running; nothing is applied until
 * a footer button is pressed. Terminate ends the chosen apps, allows the rest,
 * and uninstalls Nexus 2 when its card is selected; Keep all running allows
 * every listed app and ends nothing.
 */
export function ConflictOnboardingScreen({
  open, conflicts, ready, onComplete, onBack, onSkipOnboarding, nexus2Installed,
}: ConflictOnboardingScreenProps) {
  const { t } = useTranslation();
  const exclusions = useConflictAutoKillExclusions();
  // Nexus 2 is never allowed-listed: the service ends it whatever the list says.
  const whitelisted = useMemo(
    () => new Set(exclusions.filter(id => id !== HYTE_NEXUS2_CONFLICT_ID)),
    [exclusions],
  );
  const [busy, setBusy] = useState(false);
  const heading = t('conflicts.onboarding.title');

  // Fire-and-forget: the line is for support bundles and never holds the step.
  const report = useCallback((action: ConflictStepAction, listed: string[], alreadyEnded: string[]) => {
    void reportConflictStep({
      action,
      listed,
      whitelisted: listed.filter(id => whitelisted.has(id)),
      alreadyEnded,
    }).catch(() => null);
  }, [whitelisted]);

  const handleAction = useCallback((action: ConflictOutcomeAction, info: { listed: string[]; alreadyEnded: string[] }) => {
    report(action === 'apply' ? 'resolveAll' : 'skip', info.listed, info.alreadyEnded);
  }, [report]);

  return (
    <Overlay
      open={open}
      onClose={() => { /* non-dismissable: only the footer proceeds */ }}
      noEscDismiss
      noBackdropDismiss
      // Without this the first focusable is the skip button, and a Space press
      // meant to scroll the surface would skip the whole sequence.
      autoFocus="container"
      ariaLabel={heading}
      className={styles.surface}
      backdropClassName={styles.backdrop}
    >
      <OnboardingHeader
        onBack={onBack}
        backDisabled={busy}
        onSkip={onSkipOnboarding
          ? () => { report('skipOnboarding', conflicts.map(c => c.id), []); onSkipOnboarding(); }
          : undefined}
        skipDisabled={busy}
      />

      <ConflictOutcomePanel
        conflicts={conflicts}
        ready={ready}
        active={open}
        whitelisted={whitelisted}
        nexus2Installed={nexus2Installed}
        variant="onboarding"
        heading={(
          <div className={styles.hero}>
            <span className={styles.heroIcon} aria-hidden>
              <TriangleAlert size={HERO_ICON_SIZE} />
            </span>
            <h1 className={styles.title}>{heading}</h1>
            <p className={styles.intro}>{t('conflicts.onboarding.intro')}</p>
          </div>
        )}
        onAction={handleAction}
        onBusyChange={setBusy}
        onDone={() => onComplete()}
      />
    </Overlay>
  );
}
