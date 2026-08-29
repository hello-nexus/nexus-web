import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { Button } from '../Button/Button';
import { killConflict } from '../../../api/conflicts';
import { useTranslation } from '../../../lib/i18n';
import styles from './EndTaskButton.module.scss';

const TERMINATED_ICON_SIZE = 14;

interface EndTaskButtonProps {
  conflictId: string;
  /**
   * Current pid of the detected app. A kill that works unmounts this button
   * with the row; a pid change means the app came back, which is the signal
   * that the kill did not stick.
   */
  pid?: number;
  /** Spins as though pressed while the owner switch runs its own kill through the same catalog id. */
  busy?: boolean;
  /** Replaces the button with the terminated marker; the row stays listed. */
  terminated?: boolean;
  /** Reports a kill that stuck. Given, the caller owns the terminated state and the spinner stops here. */
  onKilled?: () => void;
  className?: string;
}

/**
 * Danger button that terminates a detected conflicting app by catalog id. Keeps
 * its spinner up after a successful kill until the watcher clears the row and
 * this unmounts; resets on failure, and on an app that restarts under a new
 * pid, so the user can retry. On a surface that keeps ended rows listed
 * (`onKilled` + `terminated`), the spinner hands off to the terminated marker
 * instead.
 */
export function EndTaskButton({ conflictId, pid, busy, terminated, onKilled, className }: EndTaskButtonProps) {
  const { t } = useTranslation();
  const [killing, setKilling] = useState(false);
  // The pid this button killed. The row keeps its React key across a respawn
  // (the catalog id does not change), so without this the spinner would run
  // until the screen closed - an Automatic service the SCM restarts never
  // clears the row at all.
  const killedPidRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!killing || killedPidRef.current === undefined) return;
    if (pid !== undefined && pid !== killedPidRef.current) {
      killedPidRef.current = undefined;
      setKilling(false);
    }
  }, [killing, pid]);

  const handleKill = useCallback(async () => {
    setKilling(true);
    killedPidRef.current = pid;
    let killed = false;
    try {
      const res = await killConflict(conflictId);
      killed = res?.killed ?? false;
    } catch {
      killed = false;
    }
    if (killed && onKilled) {
      killedPidRef.current = undefined;
      setKilling(false);
      onKilled();
      return;
    }
    if (!killed) {
      killedPidRef.current = undefined;
      setKilling(false);
    }
  }, [conflictId, onKilled, pid]);

  if (terminated) {
    return (
      <span className={styles.terminated} role="status">
        <CheckCircle2 size={TERMINATED_ICON_SIZE} aria-hidden />
        {t('conflicts.modal.terminated')}
      </span>
    );
  }

  return (
    <Button tone="danger" size="sm" loading={killing || busy === true} loadingHidesLabel className={className} onClick={handleKill}>
      {t('conflicts.modal.endTask')}
    </Button>
  );
}
