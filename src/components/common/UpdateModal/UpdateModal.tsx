import { useEffect, useRef, useState } from 'react';
import { ArrowRight, RefreshCw } from 'lucide-react';
import { DeviceModal } from '../DeviceModal/DeviceModal';
import { Button } from '../Button/Button';
import { SettingsSection } from '../SettingsSection/SettingsSection';
import { GithubGlyph } from '../../icons/NexusBrand';
import { checkForUpdate, getUpdateProgress, getUpdateStatus, startUpdate, type UpdateStatus, type UpdateProgress, type UpdatePhase } from '../../../api/update';
import { pingService } from '../../../api/service';
import { requestBuildCheck } from '../../../lib/buildReloadWatcher';
import { useTranslation } from '../../../lib/i18n';
import { useUnitPrefs } from '../../../hooks/useUiSettings';
import { formatDate, type DateFormat } from '../../../lib/units';
import styles from './UpdateModal.module.scss';

const NEVER_ACTIVE_TIMEOUT_MS = 12_000;
// Waits between automatic retries of a start that did not take.
const START_RETRY_DELAYS_MS = [2_000, 5_000, 10_000, 20_000, 30_000];

interface UpdateModalProps {
  open: boolean;
  onClose: () => void;
  status: UpdateStatus | null;
  onStatusRefreshed?: (status: UpdateStatus) => void;
  onUpdateNow?: () => void;
  // When true, the modal starts the install as it opens (the badge's one-click install).
  startedInstall?: boolean;
  // Default true. Set false to suppress the auto-check-on-open (e.g. the
  // Storybook preview, which must not fire a live POST /update/check).
  autoCheck?: boolean;
}

type ModalView = 'progress' | 'reconnecting' | 'notes' | 'whatsNew';

function phaseLabel(t: (key: string) => string, phase: UpdatePhase): string {
  switch (phase) {
    case 'downloading': return t('update.modal.downloading');
    case 'verifying': return t('update.modal.verifying');
    case 'launching': return t('update.modal.launching');
    case 'installing': return t('update.modal.installing');
    case 'done': return t('update.modal.done');
    case 'failed': return t('update.modal.failed');
    default: return '';
  }
}

// Only http(s) are linkified; a release-notes URL with any other scheme
// (javascript:, data:) renders as plain text so author markdown can't inject
// an active link.
function isSafeHref(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

function renderInline(text: string): React.ReactNode {
  // Order matters: ** before single-* so bold wins; markdown links before bare
  // URLs so a [text](url) link's own URL isn't matched a second time.
  const parts = text.split(/(\*\*[^*]+\*\*|_[^_]+_|\*[^*]+\*|\[[^\]]+\]\([^)]+\)|https?:\/\/[^\s)]+)/g);
  if (parts.length === 1) return text;
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    if (part.length >= 2
      && ((part.startsWith('_') && part.endsWith('_')) || (part.startsWith('*') && part.endsWith('*')))) {
      return <em key={i}>{part.slice(1, -1)}</em>;
    }
    const mdLink = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (mdLink && isSafeHref(mdLink[2])) {
      return (
        <a key={i} className={styles.notesLink} href={mdLink[2]} target="_blank" rel="noopener noreferrer">
          {mdLink[1]}
        </a>
      );
    }
    if (isSafeHref(part)) {
      // Peel trailing sentence punctuation so a prose URL like "see https://x."
      // doesn't bake the period into the href; render it as text after the link.
      const trail = part.match(/[.,;:!?]+$/)?.[0] ?? '';
      const href = trail ? part.slice(0, -trail.length) : part;
      return (
        <span key={i}>
          <a className={styles.notesLink} href={href} target="_blank" rel="noopener noreferrer">{href}</a>
          {trail}
        </span>
      );
    }
    return part;
  });
}

function renderMarkdown(text: string): React.ReactNode[] {
  const lines = text.split('\n');
  const nodes: React.ReactNode[] = [];
  let listItems: string[] = [];
  let keyIdx = 0;

  const flushList = () => {
    if (listItems.length > 0) {
      nodes.push(
        <ul key={`ul-${keyIdx++}`} className={styles.notesList}>
          {listItems.map((item, i) => <li key={i}>{renderInline(item)}</li>)}
        </ul>
      );
      listItems = [];
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    // ATX headings, any level 1-6. GitHub's generated notes use `### <repo>`.
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      flushList();
      const inner = renderInline(heading[2]);
      if (heading[1].length <= 2) {
        nodes.push(<h3 key={keyIdx++} className={styles.notesH1}>{inner}</h3>);
      } else {
        nodes.push(<h4 key={keyIdx++} className={styles.notesH2}>{inner}</h4>);
      }
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      listItems.push(line.slice(2));
    } else if (line === '') {
      flushList();
    } else {
      flushList();
      nodes.push(<p key={keyIdx++} className={styles.notesP}>{renderInline(line)}</p>);
    }
  }
  flushList();
  return nodes;
}

const RECONNECT_TIMEOUT_MS = 120_000;

function formatReleaseDate(unixSeconds: number, locale: string, dateFormat: DateFormat): string {
  return formatDate(new Date(unixSeconds * 1000), dateFormat, { variant: 'year', locale, system: { year: 'numeric', month: 'short', day: 'numeric' } });
}

export function UpdateModal({ open, onClose, status, onStatusRefreshed, onUpdateNow, startedInstall, autoCheck = true }: UpdateModalProps) {
  const { t, language } = useTranslation();
  const { dateFormat } = useUnitPrefs();
  const [view, setView] = useState<ModalView>('notes');
  const [progress, setProgress] = useState<UpdateProgress | null>(null);
  const [starting, setStarting] = useState(false);
  const [checking, setChecking] = useState(false);
  const [checked, setChecked] = useState(false);
  // Error message shown in the notes view when a start call or watchdog fails.
  const [startError, setStartError] = useState('');
  // Captured on open; persists so live status re-fetches can't clobber the whatsNew view.
  const whatsNewVersionRef = useRef('');
  // True once this modal started an install or saw an installer launch.
  const installActiveRef = useRef(false);
  // Set to the monotonic time when the install was kicked off; cleared when active progress arrives.
  const neverActiveDeadlineRef = useRef(0);
  const [reconnectGaveUp, setReconnectGaveUp] = useState(false);
  // Bumped when an install starts: the progress poll stops itself on an idle
  // open (notes view), so the start has to run it again.
  const [pollGen, setPollGen] = useState(0);
  // Bumped per start attempt and on close; a reply to an older attempt is ignored.
  const startTokenRef = useRef(0);
  // A progress frame read while a start is in flight predates that start.
  const startPendingRef = useRef(false);
  // True once the install this modal follows has reported active progress.
  const sawActiveRef = useRef(false);
  const retryAttemptRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const recoverStartRef = useRef(() => {});

  // Non-closable ONLY while a genuine install is in flight: live active progress
  // or the post-install reconnect. A 'progress' view with no active progress (the
  // brief pre-start window, or a start that failed) stays closable so the user is
  // never trapped behind an empty modal.
  const isInstallActive = !reconnectGaveUp
    && ((view === 'progress' && (progress?.active ?? false)) || view === 'reconnecting');

  // On open, capture justUpdatedTo into a ref before any re-fetch can clear it,
  // resolve the initial view, and reset all per-open latches.
  useEffect(() => {
    if (!open) return;
    cancelRetry();
    installActiveRef.current = startedInstall ?? false;
    neverActiveDeadlineRef.current = 0;
    startPendingRef.current = false;
    sawActiveRef.current = false;
    setStartError('');
    setStarting(false);
    setChecking(false);
    setChecked(false);
    setReconnectGaveUp(false);
    const justUpdatedTo = status?.justUpdatedTo ?? '';
    whatsNewVersionRef.current = justUpdatedTo;
    if (startedInstall) {
      setView('progress');
      void startInstall();
    } else if (justUpdatedTo) {
      setView('whatsNew');
    } else {
      setView('notes');
    }
    return () => {
      startTokenRef.current += 1;
      startPendingRef.current = false;
      cancelRetry();
    };
  // open is the only dep: the effect must fire exactly once per open, capturing
  // the status snapshot the caller passed (before any re-fetch).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    recoverStartRef.current = () => { void recoverStart(); };
  });

  const targetVersion = status?.latestVersion ?? '';

  // Progress poll: runs while the modal is open. Transitions to 'reconnecting'
  // as soon as the service goes away mid-install or phase reaches launching/installing.
  // An install this modal runs that fails or stalls goes to recoverStart.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const poll = async () => {
      const tokenAtRequest = startTokenRef.current;
      const pendingAtRequest = startPendingRef.current;
      const p = await getUpdateProgress();
      if (cancelled) return;
      // A frame requested before the latest start, or while it was pending, says nothing about it.
      const fresh = !pendingAtRequest && !startPendingRef.current && tokenAtRequest === startTokenRef.current;
      if (!p) {
        // While a start is pending, the watchdog decides rather than a reconnect.
        if (installActiveRef.current && !startPendingRef.current) {
          setView('reconnecting');
          clearInterval(id);
        } else if (neverActiveDeadlineRef.current > 0 && Date.now() > neverActiveDeadlineRef.current) {
          clearInterval(id);
          recoverStartRef.current();
        }
        return;
      }
      if (fresh || p.active) setProgress(p);
      const launching = p.phase === 'launching' || p.phase === 'installing';
      // Activity the modal did not start (such as the background stage its own
      // check triggers) can end idle, so only an installer launch is adopted.
      if (p.active && (installActiveRef.current || launching)) {
        installActiveRef.current = true;
        sawActiveRef.current = true;
        neverActiveDeadlineRef.current = 0;
        if (launching) {
          // The installer runs: a pending attempt or queued retry must not interfere.
          startTokenRef.current += 1;
          startPendingRef.current = false;
          cancelRetry();
          setStarting(false);
          setView('reconnecting');
          clearInterval(id);
        } else {
          setView(v => v === 'whatsNew' ? v : 'progress');
        }
      }
      const failed = p.phase === 'failed' || (!p.active && !p.success && p.error !== '');
      if (failed && fresh) {
        clearInterval(id);
        if (installActiveRef.current) {
          recoverStartRef.current();
        } else {
          // A recovery waiting out its backoff keeps the progress view.
          setView(v => (v === 'progress' ? v : 'notes'));
        }
        return;
      }
      if (!p.active) {
        // A fast install restarts the service between two polls, and the new
        // process reports idle: once it answers with the target, reconnect.
        if (installActiveRef.current && targetVersion) {
          const ping = await pingService();
          if (cancelled) return;
          if (ping?.version === targetVersion) {
            setView('reconnecting');
            clearInterval(id);
            return;
          }
        }
        // The install went idle without launching the installer, or never went active.
        const endedIdle = fresh && installActiveRef.current && sawActiveRef.current;
        const deadline = neverActiveDeadlineRef.current;
        if (endedIdle || (deadline > 0 && Date.now() > deadline)) {
          clearInterval(id);
          recoverStartRef.current();
          return;
        }
        if (!installActiveRef.current) {
          clearInterval(id);
        }
      }
    };
    poll();
    const id = setInterval(poll, 2000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [open, pollGen, targetVersion]);

  // Reconnect poll: only leaves 'reconnecting' once the service reports the
  // target version, preventing the old process's brief final /ping from
  // triggering a premature flip to 'notes'. After RECONNECT_TIMEOUT_MS with
  // no successful reconnect, makes the modal closable and shows a message.
  const reconnectDeadlineRef = useRef(0);
  useEffect(() => {
    if (!open || view !== 'reconnecting') return;
    reconnectDeadlineRef.current = Date.now() + RECONNECT_TIMEOUT_MS;
    let cancelled = false;
    const poll = async () => {
      const p = await pingService();
      if (cancelled) return;
      if (p && (!status?.latestVersion || p.version === status.latestVersion)) {
        // The new service usually serves a new web bundle: reload onto it now,
        // and refresh status so the notes do not offer the installed version.
        requestBuildCheck();
        getUpdateStatus().then(s => { if (!cancelled && s && onStatusRefreshed) onStatusRefreshed(s); });
        // The install is over: a later check must not inherit its latch.
        installActiveRef.current = false;
        sawActiveRef.current = false;
        neverActiveDeadlineRef.current = 0;
        setView('notes');
        return;
      }
      if (Date.now() > reconnectDeadlineRef.current) {
        setReconnectGaveUp(true);
        clearInterval(id);
      }
    };
    const id = setInterval(poll, 3000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [open, view, status?.latestVersion, onStatusRefreshed]);

  const handleCheck = async () => {
    setChecking(true);
    setStartError('');
    const s = await checkForUpdate();
    setChecking(false);
    if (!s) { setStartError(t('update.modal.checkFailed')); return; }
    setChecked(true);
    if (onStatusRefreshed) onStatusRefreshed(s);
    // A failed check knows of nothing newer, which is not "up to date".
    if (s.lastCheckError && !s.updateAvailable) setStartError(t('update.modal.checkFailed'));
  };

  // On open, the default (notes) flow runs a real check so the button shows its
  // checking spinner immediately. whatsNew (post-update) and an
  // install-in-progress open only re-read status - a check would clobber those
  // flows, and justUpdatedTo is cleared server-side on first read. Runs after
  // the reset effect so its setChecking(true) is not overwritten.
  useEffect(() => {
    if (!open) return;
    if (autoCheck && !status?.justUpdatedTo && !startedInstall) {
      void handleCheck();
      return;
    }
    let cancelled = false;
    getUpdateStatus().then(s => {
      if (!cancelled && s && onStatusRefreshed) onStatusRefreshed(s);
    });
    return () => { cancelled = true; };
  // Fire once per open from the status snapshot captured at open time.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const cancelRetry = () => {
    clearTimeout(retryTimerRef.current);
    retryTimerRef.current = undefined;
    retryAttemptRef.current = 0;
  };

  const startInstall = async (version = status?.latestVersion) => {
    const token = ++startTokenRef.current;
    // Latch before calling start so the poll can drive reconnecting if the
    // service goes away before the 2s poll sees a launching/installing frame.
    installActiveRef.current = true;
    startPendingRef.current = true;
    sawActiveRef.current = false;
    setStarting(true);
    setStartError('');
    neverActiveDeadlineRef.current = Date.now() + NEVER_ACTIVE_TIMEOUT_MS;
    // The poll runs the watchdog, which also covers a start that never answers.
    setPollGen(g => g + 1);
    const resp = await startUpdate(version, { reopenAfter: true });
    if (token !== startTokenRef.current) return;
    startPendingRef.current = false;
    setStarting(false);
    if (!resp?.started) {
      void recoverStart();
      return;
    }
    setView('progress');
    setPollGen(g => g + 1);
  };

  // A start that did not take: follow an install the service is already
  // running, stop when a fresh check finds nothing to install, otherwise retry
  // with backoff and report the failure only once the retries run out.
  const recoverStart = async () => {
    const token = ++startTokenRef.current;
    startPendingRef.current = false;
    sawActiveRef.current = false;
    installActiveRef.current = false;
    neverActiveDeadlineRef.current = 0;
    setStarting(false);
    const p = await getUpdateProgress();
    if (token !== startTokenRef.current) return;
    if (p?.active) {
      installActiveRef.current = true;
      sawActiveRef.current = true;
      setView('progress');
      setPollGen(g => g + 1);
      return;
    }
    const checkedStatus = await checkForUpdate();
    if (token !== startTokenRef.current) return;
    // A failed check says nothing about what is available.
    const s = checkedStatus && !checkedStatus.lastCheckError ? checkedStatus : null;
    if (s) {
      onStatusRefreshed?.(s);
      if (!s.updateAvailable) {
        // Often an install that went through between attempts: load its bundle.
        requestBuildCheck();
        setProgress(null);
        setChecked(true);
        setView('notes');
        return;
      }
    }
    const delay = START_RETRY_DELAYS_MS[retryAttemptRef.current];
    if (delay === undefined) {
      setStartError(t('update.modal.startFailed'));
      setView('notes');
      return;
    }
    retryAttemptRef.current += 1;
    setView('progress');
    retryTimerRef.current = setTimeout(() => { void startInstall(s?.latestVersion); }, delay);
  };

  const handleUpdateNow = () => {
    if (onUpdateNow) {
      installActiveRef.current = true;
      onUpdateNow();
      return;
    }
    cancelRetry();
    void startInstall();
  };

  const isActive = progress?.active ?? false;
  const phase = progress?.phase ?? 'idle';
  const percent = isActive ? (progress?.percent ?? 0) : 0;
  const isFailed = phase === 'failed' || (progress !== null && !progress.active && !progress.success && progress.error !== '');

  const whatsNewVersion = whatsNewVersionRef.current;
  const publishedUnix = status?.publishedAtUnix ?? 0;
  // Platforms with no staging/install flow (mac/linux) get an informational
  // primary action that opens the release asset instead of running startUpdate.
  const canAutoInstall = status?.canAutoInstall ?? true;
  const downloadUrl = status?.downloadUrl ?? '';
  const handleDownload = () => {
    if (downloadUrl) window.open(downloadUrl, '_blank', 'noopener,noreferrer');
  };

  let title = t('update.modal.title');
  if (view === 'reconnecting' && !reconnectGaveUp) title = t('update.modal.reconnecting');

  return (
    <DeviceModal
      open={open}
      onClose={onClose}
      title={title}
      icon={<RefreshCw size={18} />}
      closable={!isInstallActive}
      fit
    >
      <div className={styles.modal}>
        {view === 'progress' && (
          <div className={styles.progressView}>
            <div className={styles.phaseLabel}>
              {isActive ? phaseLabel(t, phase) : t('update.modal.starting')}
            </div>
            {status?.latestVersion && (
              <div className={styles.version}>{t('update.modal.version', { version: status.latestVersion })}</div>
            )}
            <div className={styles.progressBar}>
              <div
                className={isActive && percent > 0 ? styles.progressFill : styles.progressFillIndeterminate}
                style={isActive && percent > 0 ? { width: `${percent}%` } : undefined}
              />
            </div>
            <div className={styles.progressPct}>
              {isActive ? t('update.modal.progressLabel', { percent: String(Math.round(percent)) }) : ''}
            </div>
          </div>
        )}

        {view === 'reconnecting' && !reconnectGaveUp && (
          <div className={styles.reconnectingView}>
            <RefreshCw size={32} className={styles.spinIcon} />
            <span>{t('update.modal.reconnecting')}</span>
          </div>
        )}

        {(view === 'notes' || view === 'whatsNew' || reconnectGaveUp) && (
          <div className={styles.notesView}>
            {view === 'notes' && status?.latestVersion && (
              <div className={styles.versionHeader}>
                {status.updateAvailable && (
                  <div className={styles.newReleaseBanner}>
                    {status.channel === 'beta' ? t('update.modal.newBetaRelease') : t('update.modal.newRelease')}
                  </div>
                )}
                <div className={styles.versionBox}>
                  {status.currentVersion && status.currentVersion !== status.latestVersion ? (
                    <div className={styles.versionUpgrade}>
                      <span className={styles.versionCurrent}>{status.currentVersion}</span>
                      <ArrowRight size={14} className={styles.versionArrow} />
                      <span className={styles.versionNew}>{status.latestVersion}</span>
                    </div>
                  ) : (
                    <div className={styles.version}>{t('update.modal.version', { version: status.latestVersion })}</div>
                  )}
                </div>
                {publishedUnix > 0 && (
                  <div className={styles.releaseDate}>
                    {t('update.modal.released', { date: formatReleaseDate(publishedUnix, language, dateFormat) })}
                  </div>
                )}
              </div>
            )}
            {view === 'whatsNew' && whatsNewVersion && (
              <div className={styles.versionHeader}>
                <div className={styles.versionBox}>
                  <div className={styles.version}>{t('update.modal.version', { version: whatsNewVersion })}</div>
                </div>
                {publishedUnix > 0 && (
                  <div className={styles.releaseDate}>
                    {t('update.modal.released', { date: formatReleaseDate(publishedUnix, language, dateFormat) })}
                  </div>
                )}
              </div>
            )}
            {reconnectGaveUp && (
              <p className={styles.failedMessage}>{t('update.modal.reconnectGaveUp')}</p>
            )}
            {!reconnectGaveUp && (isFailed || startError) && (
              <p className={styles.failedMessage}>{startError || t('update.modal.failedMessage')}</p>
            )}
            {view === 'notes' && checked && !status?.updateAvailable && !isFailed && !startError && (
              <p className={styles.upToDate}>{t('update.modal.upToDate')}</p>
            )}
            {status?.releaseNotes ? (
              <SettingsSection title={t('update.modal.releaseNotes')} boxClassName={styles.releaseNotesBody}>
                {renderMarkdown(status.releaseNotes)}
              </SettingsSection>
            ) : null}
            <div className={styles.actions}>
              <a
                className={styles.releasesLink}
                href="https://github.com/hello-nexus/nexus/releases"
                target="_blank"
                rel="noopener noreferrer"
              >
                <GithubGlyph size={13} />
                {t('update.modal.releases')}
              </a>
              <div className={styles.buttonRow}>
                {view === 'notes' && (
                  <Button tone="neutral" size="md" loading={checking} onClick={handleCheck}>
                    {t('update.modal.checkNow')}
                  </Button>
                )}
                <div className={styles.buttonRowRight}>
                  {view === 'notes' && status?.updateAvailable && (
                    canAutoInstall ? (
                      <Button tone="accent" size="md" loading={starting} onClick={handleUpdateNow}>
                        {t('update.modal.downloadAndInstall')}
                      </Button>
                    ) : (
                      <Button tone="accent" size="md" onClick={handleDownload}>
                        {t('update.modal.download')}
                      </Button>
                    )
                  )}
                  {(view === 'whatsNew' || reconnectGaveUp) && (
                    <Button tone="neutral" size="md" onClick={onClose}>
                      {t('update.modal.close')}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </DeviceModal>
  );
}
