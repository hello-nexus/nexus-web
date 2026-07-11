import { useCallback, useState } from 'react';
import { Button } from '../Button/Button';
import { killConflict } from '../../../api/conflicts';
import { useTranslation } from '../../../lib/i18n';

interface EndTaskButtonProps {
  conflictId: string;
  className?: string;
}

/**
 * Danger button that terminates a detected conflicting app by catalog id. Keeps
 * its spinner up after a successful kill until the watcher clears the row and
 * this unmounts; resets on failure so the user can retry.
 */
export function EndTaskButton({ conflictId, className }: EndTaskButtonProps) {
  const { t } = useTranslation();
  const [killing, setKilling] = useState(false);
  const handleKill = useCallback(async () => {
    setKilling(true);
    let killed = false;
    try {
      const res = await killConflict(conflictId);
      killed = res?.killed ?? false;
    } catch {
      killed = false;
    }
    if (!killed) setKilling(false);
  }, [conflictId]);
  return (
    <Button tone="danger" size="sm" loading={killing} loadingHidesLabel className={className} onClick={handleKill}>
      {t('conflicts.modal.endTask')}
    </Button>
  );
}
