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
import { fetchPawnIoStatus, fixPawnIo, restartPcForPawnIo, type PawnIoStatus } from '../../../api/pawnio';
import { fixOutcome, screenFor, type PawnIoPhase } from './pawnioGate';
import styles from './PawnIoGate.module.scss';

const HERO_ICON_SIZE = 30;
const CONTINUE_DELAY_MS = 3000;
const PREVIEW_WORK_MS = 1500;

export interface PawnIoGateProps {
  status: PawnIoStatus;
  /** Phase the screen opens in; previews use it to land on a sub-state. */
  initialPhase?: PawnIoPhase;
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
export function PawnIoGate({ status, initialPhase = 'idle', preview = false, onStatus, onFixed, onContinue }: PawnIoGateProps) {
  const { t } = useTranslation();
  const dragRegion = useWindowDragRegion();
  const [current, setCurrent] = useState(status);
  const [phase, setPhase] = useState<PawnIoPhase>(initialPhase);
  const [whyOpen, setWhyOpen] = useState(false);
  const [bundleBusy, setBundleBusy] = useState(false);
  const [bundleFailed, setBundleFailed] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    const pending = timers.current;
    return () => {
      mounted.current = false;
      pending.forEach(clearTimeout);
    };
  }, []);

  // A poll that reports a different not-ok state replaces the screen; ok is
  // the host's call (it unmounts us, or holds us for the success beat).
  useEffect(() => {
    if (status.state !== 'ok') setCurrent(status);
  }, [status]);

  const later = useCallback((fn: () => void, ms: number) => {
    timers.current.push(setTimeout(() => { if (mounted.current) fn(); }, ms));
  }, []);

  const succeed = useCallback(() => {
    setPhase('done');
    onFixed();
    later(onContinue, CONTINUE_DELAY_MS);
  }, [later, onContinue, onFixed]);

  const runFix = useCallback(async () => {
    const before = current.state;
    setPhase('working');
    if (preview) {
      later(succeed, PREVIEW_WORK_MS);
      return;
    }
    const outcome = fixOutcome(before, await fixPawnIo());
    if (!mounted.current) return;
    if (outcome.kind === 'done') succeed();
    else if (outcome.kind === 'moved') {
      setPhase('idle');
      setCurrent(outcome.status);
      onStatus(outcome.status);
    } else setPhase('failed');
  }, [current.state, later, onStatus, preview, succeed]);

  const restartPc = useCallback(async () => {
    if (preview) {
      setRestarting(true);
      later(() => setRestarting(false), PREVIEW_WORK_MS);
      return;
    }
    setRestarting(true);
    await restartPcForPawnIo();
    if (mounted.current) setRestarting(false);
  }, [later, preview]);

  const checkAgain = useCallback(async () => {
    setPhase('working');
    if (preview) {
      later(() => setPhase('stillBlocked'), PREVIEW_WORK_MS);
      return;
    }
    const next = await fetchPawnIoStatus();
    if (!mounted.current) return;
    if (next && next.state !== 'blocked') {
      setCurrent(next);
      setPhase('idle');
      if (next.state === 'ok') succeed();
      else onStatus(next);
    } else setPhase('stillBlocked');
  }, [later, onStatus, preview, succeed]);

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
      {t('pawnioGate.restart.button')}
    </Button>
  );

  let heroIcon = <Cpu size={HERO_ICON_SIZE} aria-hidden />;
  let heroTone: 'accent' | 'good' | 'warn' = 'accent';
  let title = '';
  let body: string | null = null;
  let note: string | null = null;
  let content: React.ReactNode = null;
  let showWhy = true;

  if (done) {
    heroIcon = <Check size={HERO_ICON_SIZE} aria-hidden />;
    heroTone = 'good';
    title = t('pawnioGate.done.title');
    body = t('pawnioGate.done.body');
    showWhy = false;
    content = (
      <>
        <Button tone="accent" size="lg" className={styles.bigButton} onClick={onContinue}>
          {t('pawnioGate.done.button')}
        </Button>
        <span className={styles.sub}>{t('pawnioGate.done.hint')}</span>
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
          <div className={styles.stepAction}>{restartButton(false)}</div>
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
        {note && <Notice tone="warning" role="status" className={styles.note}>{note}</Notice>}
        {body && <p className={styles.body}>{body}</p>}
        {content}
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
