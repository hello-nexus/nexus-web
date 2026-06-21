import { useEffect, useRef, useState } from 'react';
import { ArrowRight, RefreshCw } from 'lucide-react';
import { DeviceModal } from '../DeviceModal/DeviceModal';
import { Button } from '../Button/Button';
import { SettingsSection } from '../SettingsSection/SettingsSection';
import { GithubGlyph } from '../../icons/NexusBrand';
import { getUpdateProgress, getUpdateStatus, startUpdate, type UpdateStatus, type UpdateProgress, type UpdatePhase } from '../../../api/update';
import { pingService } from '../../../api/service';
import { useTranslation } from '../../../lib/i18n';
import styles from './UpdateModal.module.scss';

const NEVER_ACTIVE_TIMEOUT_MS = 12_000;

interface UpdateModalProps {
  open: boolean;
  onClose: () => void;
  status: UpdateStatus | null;
  onStatusRefreshed?: (status: UpdateStatus) => void;
  onDismiss?: () => void;
  onUpdateNow?: () => void;
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

function renderInline(text: string): React.ReactNode {
  // Bold alternative is listed first so ** is matched before the single-* italic rule.
  const parts = text.split(/(\*\*[^*]+\*\*|_[^_]+_|\*[^*]+\*)/g);
  if (parts.length === 1) return text;
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    if (part.length >= 2
      && ((part.startsWith('_') && part.endsWith('_')) || (part.startsWith('*') && part.endsWith('*')))) {
      return <em key={i}>{part.slice(1, -1)}</em>;
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
    if (line.startsWith('## ')) {
      flushList();
      nodes.push(<h4 key={keyIdx++} className={styles.notesH2}>{renderInline(line.slice(3))}</h4>);
    } else if (line.startsWith('# ')) {
      flushList();
      nodes.push(<h3 key={keyIdx++} className={styles.notesH1}>{renderInline(line.slice(2))}</h3>);
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

export function UpdateModal({ open, onClose, status, onStatusRefreshed, onDismiss, onUpdateNow }: UpdateModalProps) {
  const { t } = useTranslation();
  const [view, setView] = useState<ModalView>('notes');
  const [progress, setProgress] = useState<UpdateProgress | null>(null);
  const [starting, setStarting] = useState(false);
  // Error message shown in the notes view when a start call or watchdog fails.
  const [startError, setStartError] = useState('');
  // Captured on open; persists so live status re-fetches can't clobber the whatsNew view.
  const whatsNewVersionRef = useRef('');
  // True once any active install phase has been observed in this open session.
  const installActiveRef = useRef(false);
  // Set to the monotonic time when the install was kicked off; cleared when active progress arrives.
  const neverActiveDeadlineRef = useRef(0);
  // True while the reconnect gave up, making the modal closable despite always-mode.
  const [reconnectGaveUp, setReconnectGaveUp] = useState(false);

  const isAlwaysMode = status?.updateMode === 'always';
  // Non-closable ONLY while a genuine install is in flight: live active progress
  // or the post-install reconnect. A 'progress' view with no active progress (the
  // brief pre-start window, or a start that failed) stays closable so the user is
  // never trapped behind an empty modal.
  const isInstallActive = isAlwaysMode && !reconnectGaveUp
    && ((view === 'progress' && (progress?.active ?? false)) || view === 'reconnecting');

  // Refresh /update/status when the modal opens so action button label reflects
  // current state (ready vs available) without relying on the caller's snapshot.
  // The re-fetch must NOT touch the whatsNew view - the justUpdatedTo field is
  // cleared server-side on first read, so any later fetch returns "" for it.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    getUpdateStatus().then(s => {
      if (!cancelled && s && onStatusRefreshed) onStatusRefreshed(s);
    });
    return () => { cancelled = true; };
  }, [open, onStatusRefreshed]);

  // On open, capture justUpdatedTo into a ref before any re-fetch can clear it,
  // resolve the initial view, and reset all per-open latches.
  useEffect(() => {
    if (!open) return;
    installActiveRef.current = false;
    neverActiveDeadlineRef.current = 0;
    setStartError('');
    setReconnectGaveUp(false);
    const justUpdatedTo = status?.justUpdatedTo ?? '';
    whatsNewVersionRef.current = justUpdatedTo;
    if (justUpdatedTo) {
      setView('whatsNew');
    } else {
      setView('notes');
    }
  // open is the only dep: the effect must fire exactly once per open, capturing
  // the status snapshot the caller passed (before any re-fetch).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Progress poll: runs while the modal is open. Transitions to 'reconnecting'
  // as soon as the service goes away mid-install or phase reaches launching/installing.
  // Transitions to 'notes' on failure so the user sees the error rather than freezing.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const poll = async () => {
      const p = await getUpdateProgress();
      if (cancelled) return;
      if (!p) {
        if (installActiveRef.current) {
          setView('reconnecting');
          clearInterval(id);
        }
        return;
      }
      setProgress(p);
      if (p.active) {
        installActiveRef.current = true;
        neverActiveDeadlineRef.current = 0;
        if (p.phase === 'launching' || p.phase === 'installing') {
          setView('reconnecting');
          clearInterval(id);
        } else {
          setView(v => v === 'whatsNew' ? v : 'progress');
        }
      }
      if (p.phase === 'failed' || (!p.active && !p.success && p.error !== '')) {
        setView('notes');
        clearInterval(id);
        return;
      }
      if (!p.active) {
        // Check never-went-active watchdog.
        const deadline = neverActiveDeadlineRef.current;
        if (deadline > 0 && Date.now() > deadline) {
          neverActiveDeadlineRef.current = 0;
          setStartError(t('update.modal.startFailed'));
          setView('notes');
          clearInterval(id);
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
  }, [open, t]);

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
  }, [open, view, status?.latestVersion]);

  const handleUpdateNow = async () => {
    // Latch before calling start so the poll can drive reconnecting if the
    // service goes away before the 2s poll sees a launching/installing frame.
    installActiveRef.current = true;
    if (onUpdateNow) {
      onUpdateNow();
      return;
    }
    setStarting(true);
    neverActiveDeadlineRef.current = Date.now() + NEVER_ACTIVE_TIMEOUT_MS;
    const resp = await startUpdate(status?.latestVersion, { reopenAfter: true });
    setStarting(false);
    if (!resp?.started) {
      installActiveRef.current = false;
      neverActiveDeadlineRef.current = 0;
      setStartError(t('update.modal.startFailed'));
      return;
    }
    setView('progress');
  };

  const handleLater = () => {
    onDismiss?.();
    onClose();
  };

  const isActive = progress?.active ?? false;
  const phase = progress?.phase ?? 'idle';
  const percent = isActive ? (progress?.percent ?? 0) : 0;
  const isFailed = phase === 'failed' || (progress !== null && !progress.active && !progress.success && progress.error !== '');

  const whatsNewVersion = whatsNewVersionRef.current;

  let title = t('update.modal.title');
  if (view === 'reconnecting' && !reconnectGaveUp) title = t('update.modal.reconnecting');
  if (view === 'whatsNew' && whatsNewVersion) {
    title = t('update.modal.whatsNewTitle', { version: whatsNewVersion });
  }

  return (
    <DeviceModal
      open={open}
      onClose={onClose}
      title={title}
      icon={<RefreshCw size={18} />}
      closable={!isInstallActive}
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
              status.currentVersion && status.currentVersion !== status.latestVersion ? (
                <div className={styles.versionUpgrade}>
                  <span className={styles.versionCurrent}>{status.currentVersion}</span>
                  <ArrowRight size={14} className={styles.versionArrow} />
                  <span className={styles.versionNew}>{status.latestVersion}</span>
                </div>
              ) : (
                <div className={styles.version}>{t('update.modal.version', { version: status.latestVersion })}</div>
              )
            )}
            {view === 'whatsNew' && whatsNewVersion && (
              <div className={styles.version}>{t('update.modal.version', { version: whatsNewVersion })}</div>
            )}
            {reconnectGaveUp && (
              <p className={styles.failedMessage}>{t('update.modal.reconnectGaveUp')}</p>
            )}
            {!reconnectGaveUp && (isFailed || startError) && (
              <p className={styles.failedMessage}>{startError || t('update.modal.failedMessage')}</p>
            )}
            {view === 'notes' && isAlwaysMode && !isFailed && !startError && (
              <p className={styles.alwaysModeNote}>{t('update.modal.alwaysModeNote')}</p>
            )}
            {status?.releaseNotes ? (
              <SettingsSection title={t('update.modal.releaseNotes')} boxClassName={styles.releaseNotesBody}>
                {renderMarkdown(status.releaseNotes)}
              </SettingsSection>
            ) : null}
            <div className={styles.actions}>
              <a
                className={styles.releasesLink}
                href="https://github.com/hello-nexus/nexus-releases/releases"
                target="_blank"
                rel="noopener noreferrer"
              >
                <GithubGlyph size={13} />
                {t('update.modal.releases')}
              </a>
              {view === 'notes' && status?.updateAvailable && !isFailed && !startError && !isAlwaysMode && (
                <Button tone="accent" size="sm" loading={starting} onClick={handleUpdateNow}>
                  {status.updateReady ? t('update.modal.installUpdate') : t('update.modal.downloadAndInstall')}
                </Button>
              )}
              {view === 'notes' && status?.updateAvailable && !isFailed && !startError && !isAlwaysMode ? (
                <Button tone="neutral" size="sm" onClick={handleLater}>
                  {t('update.modal.later')}
                </Button>
              ) : (
                <Button tone="neutral" size="sm" onClick={onClose}>
                  {t('update.modal.close')}
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </DeviceModal>
  );
}
