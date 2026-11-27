import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Cpu, PackageOpen, RefreshCw, RotateCcw, ShieldAlert, Wrench } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { NexusWordmark } from '../../icons/NexusBrand';
import { Button } from '../Button/Button';
import { Card } from '../Card/Card';
import { CollapsibleSection } from '../CollapsibleSection/CollapsibleSection';
import { Notice } from '../Notice/Notice';
import { CaptionButtons } from '../../../app/CaptionButtons';
import { useWindowDragRegion } from '../../../app/useWindowDragRegion';
import { isWindowsAppShell } from '../../../app/windowActions';
import { downloadSupportBundle } from '../../../api/diagnostics';
import { fetchPawnIoStatus, fixPawnIo, restartPcForPawnIo, type PawnIoFixResult, type PawnIoState, type PawnIoStatus } from '../../../api/pawnio';
import { canRestartPc, fixOutcome, okStatusFrom, screenFor, type PawnIoPhase } from './gateLogic';
import styles from './PawnIoGate.module.scss';

const HERO_ICON_SIZE = 30;
const CONTINUE_DELAY_MS = 3000;
const PREVIEW_WORK_MS = 1500;
const FIX_POLL_MS = 2000;
const FIX_POLL_LIMIT_MS = 5 * 60 * 1000;
// The shutdown the service schedules after a restart request takes a few seconds; past this the request evidently did not restart the PC.
const RESTART_GIVE_UP_MS = 30_000;

export interface PawnIoGateProps {
  status: PawnIoStatus;
  /** Phase the screen opens in; previews use it to land on a sub-state. */
  initialPhase?: PawnIoPhase;
  /** Preview only: open the success screen in its restarting wording. */
  initialRestarting?: boolean;
  /** Dev-tools preview: no fix or restart request is ever sent, outcomes are simulated. */
  preview?: boolean;
  /** A fix attempt moved the service to a different not-ok state. */
  onStatus: (status: PawnIoStatus) => void;
  /** A fix attempt reached ok; the host keeps this screen up for the success beat. */
  onFixed: () => void;
  /** Leave the gate and continue into Nexus. */
  onContinue: () => void;
}

/**
 * Full-screen "hardware driver required" gate. Shown instead of the whole
 * dashboard when the service positively reports a not-ok driver state. The
 * host owns the service status and the continue decision; this screen owns
 * only its own flow (working, done, failed, restart later, still blocked).
 */
export function PawnIoGate({ status, initialPhase = 'idle', initialRestarting = false, preview = false, onStatus, onFixed, onContinue }: PawnIoGateProps) {
  const { t } = useTranslation();
  const dragRegion = useWindowDragRegion();
  const [current, setCurrent] = useState(status);
  const [phase, setPhase] = useState<PawnIoPhase>(initialPhase);
  const [whyOpen, setWhyOpen] = useState(false);
  const [bundleBusy, setBundleBusy] = useState(false);
  const [bundleFailed, setBundleFailed] = useState(false);
  const [restarting, setRestarting] = useState(false);
  // Whether the fix that just succeeded scheduled the service's own restart.
  const [nexusRestarting, setNexusRestarting] = useState(initialRestarting);
  const [notice, setNotice] = useState<'flashing' | 'restartRefused' | null>(null);
  const stateRef = useRef(status.state);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const mounted = useRef(true);
  // A fix or recheck is awaiting the service; an ok poll then waits for its response.
  const inFlight = useRef(false);
  const finalized = useRef(false);

  useEffect(() => {
    mounted.current = true;
    const pending = timers.current;
    return () => {
      mounted.current = false;
      pending.forEach(clearTimeout);
    };
  }, []);

  stateRef.current = current.state;

  // A poll that reports a different not-ok state replaces the screen and
  // resets its flow. ok is handled by the finalizing effect below, which runs
  // the one fix call and the success screen; the host releases us after that.
  useEffect(() => {
    if (status.state === 'ok') return;
    if (status.state !== stateRef.current) {
      setPhase(p => (p === 'done' ? p : 'idle'));
      setNotice(null);
    }
    setCurrent(status);
  }, [status]);

  const later = useCallback((fn: () => void, ms: number) => {
    timers.current.push(setTimeout(() => { if (mounted.current) fn(); }, ms));
  }, []);

  const succeed = useCallback((serviceRestarting: boolean) => {
    setPhase('done');
    setNotice(null);
    setNexusRestarting(serviceRestarting);
    onStatus(okStatusFrom(current));
    onFixed();
    later(onContinue, CONTINUE_DELAY_MS);
  }, [current, later, onContinue, onFixed, onStatus]);

  // A fix answered fixing:true means another press is still running it: keep
  // the working state and read the status until it settles.
  const settleFix = useCallback(async (first: PawnIoStatus): Promise<PawnIoStatus | null> => {
    let latest: PawnIoStatus | null = first;
    const startedAt = Date.now();
    while (latest?.fixing) {
      if (Date.now() - startedAt >= FIX_POLL_LIMIT_MS) return null;
      await new Promise<void>(resolve => { later(resolve, FIX_POLL_MS); });
      if (!mounted.current) return null;
      latest = (await fetchPawnIoStatus()) ?? latest;
    }
    return latest;
  }, [later]);

  const handleFix = useCallback(async (before: PawnIoState, result: PawnIoFixResult, priorPhase: PawnIoPhase) => {
    if (result.kind === 'flashing') {
      // Not an attempt that failed: stay where we were with the button available.
      setPhase(priorPhase === 'working' ? 'idle' : priorPhase);
      setNotice('flashing');
      return;
    }
    const settled = result.kind === 'status' ? await settleFix(result.status) : null;
    if (!mounted.current) return;
    const outcome = fixOutcome(before, settled);
    if (outcome.kind === 'done') succeed(settled?.restarting === true);
    else if (outcome.kind === 'moved') {
      setPhase('idle');
      setCurrent(outcome.status);
      onStatus(outcome.status);
    } else {
      if (settled) setCurrent(settled);
      setPhase('failed');
    }
  }, [onStatus, settleFix, succeed]);

  const runFix = useCallback(async () => {
    const priorPhase = phase;
    setPhase('working');
    setNotice(null);
    if (preview) {
      later(() => succeed(false), PREVIEW_WORK_MS);
      return;
    }
    inFlight.current = true;
    try {
      const result = await fixPawnIo();
      if (!mounted.current) return;
      await handleFix(current.state, result, priorPhase);
    } finally {
      inFlight.current = false;
    }
  }, [current.state, handleFix, later, phase, preview, succeed]);

  const restartPc = useCallback(async () => {
    setNotice(null);
    setRestarting(true);
    if (preview) {
      later(() => setRestarting(false), PREVIEW_WORK_MS);
      return;
    }
    const result = await restartPcForPawnIo();
    if (!mounted.current) return;
    if (result === 'ok') {
      // The PC shuts down after a few seconds, so the button stays busy; if this page is still alive well after that, the restart did not happen.
      later(() => { setRestarting(false); setNotice('restartRefused'); }, RESTART_GIVE_UP_MS);
      return;
    }
    setRestarting(false);
    setNotice(result === 'flashing' ? 'flashing' : 'restartRefused');
  }, [later, preview]);

  const recheck = useCallback(async () => {
    const priorPhase = phase;
    setPhase('working');
    if (preview) {
      later(() => setPhase('stillBlocked'), PREVIEW_WORK_MS);
      return;
    }
    const next = await fetchPawnIoStatus();
    if (!mounted.current) return;
    if (!next) {
      setPhase(priorPhase === 'working' ? 'idle' : priorPhase);
    } else if (next.state === 'blocked') {
      setPhase('stillBlocked');
    } else if (next.state === 'ok') {
      // The read is ok, but a service that latched not-ok at boot only restarts itself through a fix call.
      const result = await fixPawnIo();
      if (!mounted.current) return;
      if (result.kind === 'failed') succeed(false);
      else await handleFix('ok', result, priorPhase);
    } else {
      setCurrent(next);
      setPhase('idle');
      onStatus(next);
    }
  }, [handleFix, later, onStatus, phase, preview, succeed]);

  const checkAgain = useCallback(async () => {
    inFlight.current = true;
    try {
      await recheck();
    } finally {
      inFlight.current = false;
    }
  }, [recheck]);

  // The host's poll read ok while this gate was up (fixed outside Nexus, or an
  // install finished before its response arrived). With a fix or recheck in
  // flight its own response runs the success handling; otherwise make the one
  // fix call that makes the service redetect hardware and restart itself.
  useEffect(() => {
    if (preview || status.state !== 'ok' || phase === 'done' || inFlight.current || finalized.current) return;
    finalized.current = true;
    inFlight.current = true;
    void (async () => {
      try {
        const result = await fixPawnIo();
        if (!mounted.current) return;
        // The driver already reads ok, so a refused or failed finalizing call
        // (flash in progress, request error) must not trap the user here.
        if (result.kind === 'failed' || result.kind === 'flashing') succeed(false);
        else await handleFix('ok', result, phase);
      } finally {
        inFlight.current = false;
      }
    })();
  }, [handleFix, phase, preview, status.state, succeed]);

  const exportBundle = useCallback(async () => {
    setBundleBusy(true);
    setBundleFailed(false);
    const ok = preview ? true : await downloadSupportBundle();
    if (!mounted.current) return;
    setBundleBusy(false);
    setBundleFailed(!ok);
  }, [preview]);

  const screen = screenFor(current.state === 'ok' ? 'notRunning' : current.state);
  const working = phase === 'working' || current.fixing;
  const done = phase === 'done';
  const failed = phase === 'failed';
  const restartLater = phase === 'restartLater';

  const bundleButton = (
    <Button
      tone="neutral"
      size="md"
      icon={<PackageOpen size={16} aria-hidden />}
      onClick={exportBundle}
      loading={bundleBusy}
    >
      {t('settings.diagnostics.supportBundleButton')}
    </Button>
  );

  const restartButton = (big: boolean) => (
    <Button
      tone="accent"
      size={big ? 'lg' : 'md'}
      className={big ? styles.bigButton : undefined}
      icon={<RotateCcw size={18} aria-hidden />}
      onClick={restartPc}
      loading={restarting}
    >
      {t(restarting ? 'pawnioGate.restart.working' : 'pawnioGate.restart.button')}
    </Button>
  );

  let heroIcon = <Cpu size={HERO_ICON_SIZE} aria-hidden />;
  let heroTone: 'accent' | 'good' | 'warn' = 'accent';
  let title = '';
  let body: string | null = null;
  let note: string | null = null;
  let content: React.ReactNode = null;
  let showWhy = true;
  let retry: React.ReactNode = null;

  if (done) {
    heroIcon = <Check size={HERO_ICON_SIZE} aria-hidden />;
    heroTone = 'good';
    title = t('pawnioGate.done.title');
    body = t(nexusRestarting ? 'pawnioGate.done.body' : 'pawnioGate.done.ready');
    showWhy = false;
    content = (
      <>
        <Button tone="accent" size="lg" className={styles.bigButton} onClick={onContinue}>
          {t('pawnioGate.done.button')}
        </Button>
      </>
    );
  } else if (failed) {
    heroIcon = <Wrench size={HERO_ICON_SIZE} aria-hidden />;
    heroTone = 'warn';
    title = t('pawnioGate.steps.title');
    showWhy = false;
    content = (
      <ol className={styles.steps}>
        <li>
          <div>{t('pawnioGate.steps.restart')}</div>
          {canRestartPc(current.state) && <div className={styles.stepAction}>{restartButton(false)}</div>}
        </li>
        <li>
          <div>{t('pawnioGate.steps.installer')}</div>
          <span className={styles.dim}>{t('pawnioGate.steps.installerHint')}</span>
        </li>
        <li>
          <div>{t('pawnioGate.steps.discord')}</div>
          <div className={styles.stepAction}>{bundleButton}</div>
        </li>
      </ol>
    );
    retry = current.fixAction === 'install' || current.fixAction === 'repair' ? (
      <Button tone="neutral" size="md" icon={<RefreshCw size={16} aria-hidden />} onClick={runFix}>
        {t('pawnioGate.steps.retry')}
      </Button>
    ) : null;
  } else if (screen === 'install') {
    title = t(working ? 'pawnioGate.installing.title' : 'pawnioGate.install.title');
    body = t(working ? 'pawnioGate.installing.body' : 'pawnioGate.install.body');
    if (current.state === 'permissionDeclined' && !working) note = t('pawnioGate.install.permission');
    content = (
      <Button tone="accent" size="lg" className={styles.bigButton}
        icon={<PackageOpen size={18} aria-hidden />} loading={working} onClick={runFix}>
        {t(working ? 'pawnioGate.installing.button' : 'pawnioGate.install.button')}
      </Button>
    );
  } else if (screen === 'restart') {
    heroIcon = <RotateCcw size={HERO_ICON_SIZE} aria-hidden />;
    title = t('pawnioGate.restart.title');
    body = t(restartLater ? 'pawnioGate.restart.laterBody' : 'pawnioGate.restart.body');
    showWhy = !restartLater;
    content = (
      <>
        {restartButton(true)}
        {restartLater
          ? <span className={styles.sub}>{t('pawnioGate.restart.laterHint')}</span>
          : (
            <button type="button" className={styles.link} onClick={() => setPhase('restartLater')}>
              {t('pawnioGate.restart.later')}
            </button>
          )}
      </>
    );
  } else if (screen === 'notRunning') {
    heroIcon = <Wrench size={HERO_ICON_SIZE} aria-hidden />;
    heroTone = 'warn';
    title = t(working ? 'pawnioGate.fixing.title' : 'pawnioGate.notRunning.title');
    body = t(working ? 'pawnioGate.installing.body' : 'pawnioGate.notRunning.body');
    content = (
      <Button tone="accent" size="lg" className={styles.bigButton}
        icon={<Wrench size={18} aria-hidden />} loading={working} onClick={runFix}>
        {t(working ? 'pawnioGate.fixing.button' : 'pawnioGate.notRunning.button')}
      </Button>
    );
  } else {
    heroIcon = <ShieldAlert size={HERO_ICON_SIZE} aria-hidden />;
    heroTone = 'warn';
    title = t('pawnioGate.blocked.title');
    body = t('pawnioGate.blocked.body');
    if (phase === 'stillBlocked') note = t('pawnioGate.blocked.still');
    content = (
      <>
        <ol className={styles.steps}>
          <li>
            <div>{t('pawnioGate.blocked.antivirus')}</div>
            <span className={styles.dim}>{t('pawnioGate.blocked.antivirusHint')}</span>
          </li>
          <li>
            <div>{t('pawnioGate.blocked.security')}</div>
            <span className={styles.dim}>{t('pawnioGate.blocked.securityHint')}</span>
          </li>
          <li><div>{t('pawnioGate.steps.restart')}</div></li>
        </ol>
        <Button tone="neutral" size="lg" className={styles.bigButton}
          icon={<RefreshCw size={18} aria-hidden />} loading={working} onClick={checkAgain}>
          {t('pawnioGate.blocked.check')}
        </Button>
        {bundleButton}
      </>
    );
  }

  return (
    <div className={styles.page} role="main" aria-label={title}>
      <div className={styles.topBar} {...dragRegion}>
        {isWindowsAppShell() && <CaptionButtons />}
      </div>
      <Card className={styles.card}>
        <div className={styles.stack}>
        <div className={styles.brand}><NexusWordmark height={22} /></div>
        {!failed && <span className={`${styles.hero} ${styles[heroTone]}`} aria-hidden>{heroIcon}</span>}
        <h1 className={styles.title}>{title}</h1>
        {notice && (
          <Notice tone="warning" role="alert" className={styles.note}>
            {t(notice === 'flashing' ? 'pawnioGate.notice.flashing' : 'pawnioGate.notice.restartRefused')}
          </Notice>
        )}
        {note && <Notice tone="warning" role="status" className={styles.note}>{note}</Notice>}
        {body && <p className={styles.body}>{body}</p>}
        {content}
        {retry}
        {bundleFailed && (
          <Notice tone="critical" role="alert" className={styles.note}>
            {t('settings.diagnostics.supportBundleFailed')}
          </Notice>
        )}
        {showWhy && (
          <div className={styles.why}>
            <CollapsibleSection title={t('pawnioGate.why.title')} open={whyOpen} onToggle={() => setWhyOpen(o => !o)}>
              <p className={styles.whyBody}>{t('pawnioGate.why.body')}</p>
            </CollapsibleSection>
          </div>
        )}
        </div>
      </Card>
    </div>
  );
}
