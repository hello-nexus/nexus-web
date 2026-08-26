import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '../Button/Button';
import { killConflict } from '../../../api/conflicts';
import { useTranslation } from '../../../lib/i18n';

interface EndTaskButtonProps {
  conflictId: string;
  /**
   * Current pid of the detected app. A kill that works unmounts this button
   * with the row; a pid change means the app came back, which is the signal
   * that the kill did not stick.
   */
  pid?: number;
  className?: string;
}

/**
 * Danger button that terminates a detected conflicting app by catalog id. Keeps
 * its spinner up after a successful kill until the watcher clears the row and
 * this unmounts; resets on failure, and on an app that restarts under a new
 * pid, so the user can retry.
 */
export function EndTaskButton({ conflictId, pid, className }: EndTaskButtonProps) {
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
    if (!killed) {
      killedPidRef.current = undefined;
      setKilling(false);
    }
  }, [conflictId, pid]);

  return (
    <Button tone="danger" size="sm" loading={killing} loadingHidesLabel className={className} onClick={handleKill}>
      {t('conflicts.modal.endTask')}
    </Button>
  );
}
