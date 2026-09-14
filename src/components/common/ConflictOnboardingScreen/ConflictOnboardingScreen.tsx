import { useCallback, useState } from 'react';
import { ArrowLeft, PackageMinus, ShieldCheck, TriangleAlert } from 'lucide-react';
import { Overlay } from '../Overlay/Overlay';
import { Button } from '../Button/Button';
import { ConflictAllClear } from '../ConflictAllClear/ConflictAllClear';
import { ConflictAppCard } from '../ConflictAppCard/ConflictAppCard';
import { SkipOnboardingButton } from '../SkipOnboardingButton/SkipOnboardingButton';
import { useTranslation } from '../../../lib/i18n';
import { useConflictAutostart } from '../../../hooks/useConflictAutostart';
import { useConflictDevices } from '../../../hooks/useConflictDevices';
import { useConflictResolveAll } from '../../../hooks/useConflictResolveAll';
import { useConflictRoster } from '../../../hooks/useConflictRoster';
import type { DetectedConflict } from '../../../api/conflicts';
import { uninstallNexus2 } from '../../../api/migration';
import styles from './ConflictOnboardingScreen.module.scss';

const HERO_ICON_SIZE = 40;
const UNINSTALL_ICON_SIZE = 28;

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
  /** Nexus 2 is installed: Resolve all also runs its silent uninstall, and the screen says so. */
  nexus2Installed?: boolean;
}

/**
 * Conflict gate, after the import step and before device selection: apps
 * already driving the hardware the next screen enumerates. Resolve all ends
 * every app, turns off every boot entry, uninstalls Nexus 2 when it is
 * installed, then moves on; Skip moves on and changes nothing, so a user who
 * wants past this screen keeps their setup exactly as it was.
 */
export function ConflictOnboardingScreen({
  open, conflicts, ready, onComplete, onBack, onSkipOnboarding, nexus2Installed,
}: ConflictOnboardingScreenProps) {
  const { t } = useTranslation();
  // Sticky rows: an app ended here stays listed as terminated, so the step
  // does not empty out under the user as they work through it.
  const { entries, conflicts: roster, markTerminated } = useConflictRoster(conflicts, open, ready);
  const { devicesByApp, setOwner } = useConflictDevices(roster, open);
  const { autostartByApp, disable: disableAutostart } = useConflictAutostart(roster, open);
  const { pending, autostartDisabledIds, resolveAll } = useConflictResolveAll(entries, markTerminated, autostartByApp, disableAutostart);
  const [busy, setBusy] = useState(false);
  const heading = t('conflicts.onboarding.title');

  // Best-effort throughout: a kill or uninstall that did not stick is not a
  // reason to hold the user here - the top-bar badge keeps offering it.
  const handleResolveAll = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (pending) await resolveAll();
      if (nexus2Installed) await uninstallNexus2().catch(() => null);
    } finally {
      setBusy(false);
    }
    onComplete();
  }, [busy, pending, resolveAll, nexus2Installed, onComplete]);

  return (
    <Overlay
      open={open}
      onClose={() => { /* non-dismissable: only the footer proceeds */ }}
      noEscDismiss
      noBackdropDismiss
      onEnter={() => { void handleResolveAll(); }}
      // Without this the first focusable is the skip button, and a Space press
      // meant to scroll the surface would skip the whole sequence.
      autoFocus="container"
      ariaLabel={heading}
      className={styles.surface}
      backdropClassName={styles.backdrop}
    >
      <div className={styles.topBar}>
        {onBack ? (
          <Button tone="ghost" size="sm" icon={<ArrowLeft />} disabled={busy} onClick={onBack}>
            {t('nav.back')}
          </Button>
        ) : <span />}
        {onSkipOnboarding ? <SkipOnboardingButton onSkip={onSkipOnboarding} disabled={busy} /> : <span />}
      </div>

      <div className={styles.hero}>
        <span className={styles.heroIcon} aria-hidden>
          <TriangleAlert size={HERO_ICON_SIZE} />
        </span>
        <h1 className={styles.title}>{heading}</h1>
        <p className={styles.intro}>{t('conflicts.onboarding.intro')}</p>
      </div>

      <div className={styles.section}>
        {/* Nothing until the snapshot resolves: an empty pre-load list is not
            an all-clear, and Back from the lighting gate re-seeds it. */}
        {!ready ? null : entries.length === 0 ? (
          <ConflictAllClear className={styles.allClear} />
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
                  autostartDisabled={autostartDisabledIds.has(entry.conflict.id)}
                />
              </div>
            ))}
          </div>
        )}
        {ready && nexus2Installed && (
          <div className={styles.uninstall} role="note">
            <span className={styles.uninstallIcon} aria-hidden>
              <PackageMinus size={UNINSTALL_ICON_SIZE} />
            </span>
            <span className={styles.uninstallTitle}>{t('conflicts.onboarding.uninstallNexus2')}</span>
          </div>
        )}
      </div>

      <div className={styles.footerRow}>
        <Button tone="ghost" size="lg" disabled={busy} onClick={onComplete}>
          {t('conflicts.onboarding.skip')}
        </Button>
        <Button
          tone="accent"
          size="lg"
          icon={<ShieldCheck />}
          loading={busy}
          loadingHidesLabel
          onClick={() => { void handleResolveAll(); }}
          className={styles.continueButton}
        >
          {t('conflicts.modal.resolveAll')}
        </Button>
      </div>
    </Overlay>
  );
}
