import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, DownloadCloud } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { Overlay } from '../Overlay/Overlay';
import { Button } from '../Button/Button';
import { ImportCenter, type ImportCenterHandle, type ImportSourceId, type SourceDetection } from '../ImportCenter/ImportCenter';
import { Toggle } from '../Toggle/Toggle';
import { closeFanControlApp, disableFanControlAutostart, dismissFanControlImport } from '../../../api/fancontrol';
import type { FanControlStatusResponse } from '../../../api/fancontrol';
import { closeNexus2App, disableNexus2Autostart, dismissNexus2Welcome } from '../../../api/migration';
import type { Nexus2StatusResponse } from '../../../api/migration';
import styles from './ImportOnboardingScreen.module.scss';

type ApplyPhase = 'idle' | 'applying' | 'failed';

const HERO_ICON_SIZE = 40;

/** True when the request came back without an error; a throw counts as failure. */
async function runAction(call: () => Promise<{ error: boolean } | null>): Promise<boolean> {
  try {
    const res = await call();
    return !!res && !res.error;
  } catch {
    return false;
  }
}

export interface ImportOnboardingScreenProps {
  open: boolean;
  /** Detection from the Dashboard. */
  fanControl: FanControlStatusResponse | null;
  nexus2: Nexus2StatusResponse | null;
  /** Which apps this gate is being shown for: only these start included, get
   *  closed, and have their offer flag latched. An app not listed here may
   *  still appear (it holds importable data) but stays off by default. */
  offeredFor: Partial<Record<ImportSourceId, boolean>>;
  onComplete: () => void;
  /** Steps back to the previous onboarding screen; the Back button only renders when provided. */
  onBack?: () => void;
}

/**
 * The onboarding gate for bringing a previous setup over. Continuing also
 * closes the detected apps and removes their autostart, since each drives
 * hardware Nexus is taking over.
 */
export function ImportOnboardingScreen({ open, fanControl, nexus2, offeredFor, onComplete, onBack }: ImportOnboardingScreenProps) {
  const { t } = useTranslation();

  const [applyPhase, setApplyPhase] = useState<ApplyPhase>('idle');
  const [dismissing, setDismissing] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const [importHasSelection, setImportHasSelection] = useState(false);
  const [actionError, setActionError] = useState(false);
  // Closing the app and clearing its autostart. On by default: it and Nexus
  // drive the same hardware, so leaving it running is the unusual choice.
  const [closeApps, setCloseApps] = useState<Partial<Record<ImportSourceId, boolean>>>({});
  const shouldClose = (id: ImportSourceId) => closeApps[id] ?? true;
  const importHandle = useRef<ImportCenterHandle | null>(null);

  // Listed when the app holds data to import. Detected-but-empty apps are not
  // listed, but are still closed below: they drive the same hardware.
  const nexus2Here = nexus2?.importAvailable === true;
  const fanControlHere = fanControl?.importAvailable === true;
  const nexus2Detected = nexus2?.detected === true;
  const fanControlDetected = fanControl?.detected === true;

  // Resets on every open; the component stays mounted across open toggles.
  useEffect(() => {
    if (!open) return;
    setApplyPhase('idle');
    setDismissing(false);
    setActionError(false);
    setCloseApps({});
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
  // Every listed app starts on; `offeredFor` still decides whose offer flag
  // latches, so an app dealt with before is not marked dealt with again.
  const includedByDefault: Partial<Record<ImportSourceId, boolean>> = {
    nexus2: nexus2Here,
    fancontrol: fanControlHere,
  };

  const closeRow = (id: ImportSourceId, app: string) => (
    <div className={styles.closeRow}>
      <span className={styles.closeLabel}>{t('importOnboarding.closeApp')}</span>
      <Toggle
        checked={shouldClose(id)}
        disabled={applyPhase !== 'idle'}
        ariaLabel={t('importOnboarding.closeAppAria', { app })}
        onChange={next => setCloseApps(prev => ({ ...prev, [id]: next }))}
      />
    </div>
  );

  // Latches the offer flag only for the apps this gate was shown for; latching
  // the other would silently consume a gate that app has not had yet.
  const dismissOffered = async () => {
    if (offeredFor.nexus2) await dismissNexus2Welcome().catch(() => null);
    if (offeredFor.fancontrol) await dismissFanControlImport().catch(() => null);
  };

  // Both buttons close the apps and clear their autostart; only one imports.
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

    // Runs for every DETECTED app, not just the ones with data: an app that is
    // installed but never configured still drives the hardware. Close before
    // clearing autostart, so a relaunch cannot race the autostart removal.
    let actionsOk = true;
    if (nexus2Detected && shouldClose('nexus2')) {
      actionsOk = await runAction(closeNexus2App) && actionsOk;
      actionsOk = await runAction(disableNexus2Autostart) && actionsOk;
    }
    if (fanControlDetected && shouldClose('fancontrol')) {
      actionsOk = await runAction(closeFanControlApp) && actionsOk;
      actionsOk = await runAction(disableFanControlAutostart) && actionsOk;
    }
    setActionError(!actionsOk);

    if (importFailed || !actionsOk) {
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
      ariaLabel={heading}
      className={styles.surface}
      backdropClassName={styles.backdrop}
    >
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
          rowFooter={{
            nexus2: nexus2Detected ? closeRow('nexus2', t('importCenter.source.nexus2')) : undefined,
            fancontrol: fanControlDetected ? closeRow('fancontrol', t('importCenter.source.fancontrol')) : undefined,
          }}
          disabled={applyPhase !== 'idle'}
          onBusyChange={setImportBusy}
          showAction={false}
          onSelectionChange={setImportHasSelection}
          handleRef={importHandle}
        />
      </div>

      {actionError && (
        <p className={styles.error} role="alert">{t('importOnboarding.errorActions')}</p>
      )}

      <div className={styles.footerRow}>
        {onBack && (
          <Button tone="ghost" size="lg" icon={<ArrowLeft />} disabled={busy || importBusy} onClick={onBack}>
            {t('nav.back')}
          </Button>
        )}
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
