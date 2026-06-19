import { useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { DeviceModal } from '../DeviceModal/DeviceModal';
import { Button } from '../Button/Button';
import { getUpdateProgress, getUpdateStatus, startUpdate, type UpdateStatus, type UpdateProgress, type UpdatePhase } from '../../../api/update';
import { pingService } from '../../../api/service';
import { useTranslation } from '../../../lib/i18n';
import styles from './UpdateModal.module.scss';

interface UpdateModalProps {
  open: boolean;
  onClose: () => void;
  status: UpdateStatus | null;
  onStatusRefreshed?: (status: UpdateStatus) => void;
  onDismiss?: () => void;
  onUpdateNow?: () => void;
}

type ModalView = 'progress' | 'reconnecting' | 'notes';

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
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  if (parts.length === 1) return text;
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
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

  // Refresh /update/status when the modal opens so action button label reflects
  // current state (ready vs available) without relying on the caller's snapshot.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    getUpdateStatus().then(s => {
      if (!cancelled && s && onStatusRefreshed) onStatusRefreshed(s);
    });
    return () => { cancelled = true; };
  }, [open, onStatusRefreshed]);

  // Progress poll: runs only while the modal is open and a non-terminal phase
  // is active. Stops on 'failed' or when progress becomes inactive.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const poll = async () => {
      const p = await getUpdateProgress();
      if (cancelled) return;
      if (p) {
        setProgress(p);
        if (p.active) {
          if (p.phase === 'installing') {
            setView('reconnecting');
          } else {
            setView('progress');
          }
        }
        // Stop polling on terminal: failed or inactive with no pending phase.
        if (!p.active || p.phase === 'failed') {
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
  }, [open]);

  // Reconnect poll: only leaves 'reconnecting' once the service reports the
  // target version, preventing the old process's brief final /ping from
  // triggering a premature flip to 'notes'.
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
      // Fallback: accept any response after the deadline.
      if (p && Date.now() > reconnectDeadlineRef.current) {
        setView('notes');
      }
    };
    const id = setInterval(poll, 3000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [open, view, status?.latestVersion]);

  const handleUpdateNow = async () => {
    if (onUpdateNow) {
      onUpdateNow();
      return;
    }
    setStarting(true);
    await startUpdate(status?.latestVersion);
    setStarting(false);
    setView('progress');
  };

  const handleLater = () => {
    onDismiss?.();
    onClose();
  };

  const isActive = progress?.active ?? false;
  const phase = progress?.phase ?? 'idle';
  const percent = progress?.percent ?? 0;
  const isFailed = phase === 'failed' || (progress !== null && !progress.active && !progress.success && progress.error !== '');

  let title = t('update.modal.title');
  if (view === 'reconnecting') title = t('update.modal.reconnecting');

  return (
    <DeviceModal
      open={open}
      onClose={onClose}
      title={title}
      icon={<RefreshCw size={18} />}
    >
      <div className={styles.modal}>
        {view === 'progress' && isActive && (
          <div className={styles.progressView}>
            <div className={styles.phaseLabel}>{phaseLabel(t, phase)}</div>
            {status?.latestVersion && (
              <div className={styles.version}>{t('update.modal.version', { version: status.latestVersion })}</div>
            )}
            <div className={styles.progressBar}>
              <div className={styles.progressFill} style={{ width: `${percent}%` }} />
            </div>
            <div className={styles.progressPct}>{t('update.modal.progressLabel', { percent: String(Math.round(percent)) })}</div>
          </div>
        )}

        {view === 'reconnecting' && (
          <div className={styles.reconnectingView}>
            <RefreshCw size={32} className={styles.spinIcon} />
            <span>{t('update.modal.reconnecting')}</span>
          </div>
        )}

        {view === 'notes' && (
          <div className={styles.notesView}>
            {isFailed && (
              <p className={styles.failedMessage}>{t('update.modal.failedMessage')}</p>
            )}
            {status?.releaseNotes ? (
              <div className={styles.releaseNotes}>
                <div className={styles.releaseNotesLabel}>{t('update.modal.releaseNotes')}</div>
                <div className={styles.releaseNotesBody}>
                  {renderMarkdown(status.releaseNotes)}
                </div>
              </div>
            ) : null}
            <div className={styles.actions}>
              {status?.updateAvailable && !isFailed && (
                <Button tone="accent" size="sm" loading={starting} onClick={handleUpdateNow}>
                  {status.updateReady ? t('update.modal.installUpdate') : t('update.modal.updateNow')}
                </Button>
              )}
              {status?.updateAvailable && !isFailed ? (
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
