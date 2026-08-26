import { useCallback, useState } from 'react';
import { Check } from 'lucide-react';
import { Button } from '../Button/Button';
import { disableConflictAutostart, type ConflictAutostartEntry } from '../../../api/conflicts';
import { useTranslation } from '../../../lib/i18n';

interface RemoveFromStartupButtonProps {
  conflictId: string;
  entry: ConflictAutostartEntry;
  className?: string;
}

/**
 * Removes one app's autostart entry, on an explicit click only. The app keeps
 * running afterwards, so the watcher never clears the row - the button latches
 * to a done state itself instead of waiting to unmount.
 */
export function RemoveFromStartupButton({ conflictId, entry, className }: RemoveFromStartupButtonProps) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const handleClick = useCallback(async () => {
    setBusy(true);
    let ok = false;
    try {
      const res = await disableConflictAutostart(conflictId);
      ok = res?.ok ?? false;
    } catch {
      ok = false;
    }
    setBusy(false);
    if (ok) setDone(true);
  }, [conflictId]);

  if (done) {
    return (
      <span className={className}>
        <Check size={14} aria-hidden />
        {' '}
        {t('conflicts.modal.startupRemoved')}
      </span>
    );
  }

  return (
    <Button
      tone="neutral"
      size="sm"
      loading={busy}
      loadingHidesLabel
      className={className}
      title={t('conflicts.modal.removeStartupEntry', { entry: entry.entryName })}
      onClick={handleClick}
    >
      {entry.kind === 'service'
        ? t('conflicts.modal.removeStartupService')
        : t('conflicts.modal.removeStartup')}
    </Button>
  );
}
