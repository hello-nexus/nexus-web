import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, DownloadCloud } from 'lucide-react';
import { SkipOnboardingButton } from '../SkipOnboardingButton/SkipOnboardingButton';
import { useTranslation } from '../../../lib/i18n';
import { Overlay } from '../Overlay/Overlay';
import { Button } from '../Button/Button';
import { ImportCenter, type ImportCenterHandle, type ImportSourceId, type SourceDetection } from '../ImportCenter/ImportCenter';
import { dismissFanControlImport } from '../../../api/fancontrol';
import type { FanControlStatusResponse } from '../../../api/fancontrol';
import { dismissNexus2Welcome } from '../../../api/migration';
import type { Nexus2StatusResponse } from '../../../api/migration';
import styles from './ImportOnboardingScreen.module.scss';

type ApplyPhase = 'idle' | 'applying' | 'failed';

const HERO_ICON_SIZE = 40;

export interface ImportOnboardingScreenProps {
  /** Skips every remaining onboarding step; renders the top-right escape hatch when provided. */
  onSkipOnboarding?: () => void;
  open: boolean;
  /** Detection from the Dashboard. */
  fanControl: FanControlStatusResponse | null;
  nexus2: Nexus2StatusResponse | null;
  /** Which apps this gate is being shown for: only these start included and have their offer flag latched. An app not listed here may still appear (it holds importable data) but stays off by default. */
  offeredFor: Partial<Record<ImportSourceId, boolean>>;
  onComplete: () => void;
  /** Steps back to the previous onboarding screen; the Back button only renders when provided. */
  onBack?: () => void;
}

/**
 * The onboarding gate for bringing a previous setup over. It never closes an
 * app or touches its autostart; the end-of-onboarding conflict step does that,
 * per app, on an explicit click.
 */
export function ImportOnboardingScreen({ open, fanControl, nexus2, offeredFor, onComplete, onBack, onSkipOnboarding }: ImportOnboardingScreenProps) {
  const { t } = useTranslation();

  const [applyPhase, setApplyPhase] = useState<ApplyPhase>('idle');
  const [dismissing, setDismissing] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const [importHasSelection, setImportHasSelection] = useState(false);
  const importHandle = useRef<ImportCenterHandle | null>(null);

  // Listed when the app holds data to import.
  const nexus2Here = nexus2?.importAvailable === true;
  const fanControlHere = fanControl?.importAvailable === true;

  // Resets on every open; the component stays mounted across open toggles.
  useEffect(() => {
    if (!open) return;
    setApplyPhase('idle');
    setDismissing(false);
  }, [open]);

  if (!open) return null;

  const heading = t('importOnboarding.title');

  // Only what is actually on this PC, so the list's own title stays true.
  const sources: ImportSourceId[] = [
    ...(nexus2Here ? (['nexus2'] as const) : []),
    ...(fanControlHere ? (['fancontrol'] as const) : []),
  ];
  const detected: Partial<Record<ImportSourceId, SourceDetection>> = {
    ...(nexus2Here ? { nexus2: { importAvailable: true } } : {}),
    ...(fanControlHere ? { fancontrol: { importAvailable: true, configCount: fanControl?.configs.length ?? 0 } } : {}),
  };
  // Nexus 2 starts on; every other app is opt-in. `offeredFor` still decides
  // whose offer flag latches, so an app dealt with before is not re-marked.
  const includedByDefault: Partial<Record<ImportSourceId, boolean>> = {
    nexus2: nexus2Here,
    fancontrol: false,
  };

  // Latches the offer flag only for the apps this gate was shown for; latching
  // the other would silently consume a gate that app has not had yet.
  const dismissOffered = async () => {
    if (offeredFor.nexus2) await dismissNexus2Welcome().catch(() => null);
    if (offeredFor.fancontrol) await dismissFanControlImport().catch(() => null);
  };

  // Neither button touches the detected apps; closing them and clearing their
  // autostart is the end-of-onboarding conflict step's job, on an explicit
  // per-app click. Only one button imports.
  const handleContinue = async (runImport: boolean) => {
    if (applyPhase === 'applying' || dismissing || importBusy) return;

    // A second click after a failure always dismisses; it never retries.
    if (applyPhase === 'failed') {
      setDismissing(true);
      await dismissOffered();
      setDismissing(false);
      onComplete();
      return;
    }

    setApplyPhase('applying');

    let importFailed = false;
    if (runImport && importHasSelection && importHandle.current) {
      importFailed = await importHandle.current.runImport() === 'failed';
    }

    if (importFailed) {
      setApplyPhase('failed');
      return;
    }

    setDismissing(true);
    await dismissOffered();
    setDismissing(false);
    onComplete();
  };

  const busy = applyPhase === 'applying' || dismissing;

  return (
    <Overlay
      open={open}
      onClose={() => { /* non-dismissable: only the footer proceeds */ }}
      noEscDismiss
      noBackdropDismiss
      onEnter={() => handleContinue(true)}
      // Without this the first focusable is the skip button, and a Space press
      // meant to scroll the surface would skip the whole sequence.
      autoFocus="container"
      ariaLabel={heading}
      className={styles.surface}
      backdropClassName={styles.backdrop}
    >
      <div className={styles.topBar}>
        {onBack ? (
          <Button tone="ghost" size="sm" icon={<ArrowLeft />} disabled={busy || importBusy} onClick={onBack}>
            {t('nav.back')}
          </Button>
        ) : <span />}
        {onSkipOnboarding ? <SkipOnboardingButton onSkip={onSkipOnboarding} /> : <span />}
      </div>
      <div className={styles.hero}>
        <span className={styles.heroIcon} aria-hidden>
          <DownloadCloud size={HERO_ICON_SIZE} />
        </span>
        <h1 className={styles.title}>{heading}</h1>
      </div>

      <div className={styles.section}>
        <ImportCenter
          open={open}
          sources={sources}
          detected={detected}
          includedByDefault={includedByDefault}
          disabled={applyPhase !== 'idle'}
          onBusyChange={setImportBusy}
          showAction={false}
          onSelectionChange={setImportHasSelection}
          handleRef={importHandle}
        />
      </div>

      <div className={styles.footerRow}>
        {applyPhase !== 'failed' && sources.length > 0 && (
          <Button
            tone="neutral"
            size="lg"
            onClick={() => handleContinue(false)}
            disabled={busy || importBusy}
            className={styles.continueButton}
          >
            {t('importOnboarding.skip')}
          </Button>
        )}
        <Button
          tone="accent"
          size="lg"
          onClick={() => handleContinue(true)}
          loading={busy}
          loadingHidesLabel
          disabled={importBusy || (applyPhase !== 'failed' && sources.length > 0 && !importHasSelection)}
          className={styles.continueButton}
        >
          {applyPhase === 'failed'
            ? t('importOnboarding.continueAnyway')
            : sources.length > 0
              ? t('importOnboarding.importAndContinue')
              : t('importOnboarding.continue')}
        </Button>
      </div>
    </Overlay>
  );
}
