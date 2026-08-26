import { useCallback, useState } from 'react';
import { Check } from 'lucide-react';
import { Button } from '../Button/Button';
import { disableConflictAutostart, type ConflictAutostartEntry } from '../../../api/conflicts';
import { useTranslation } from '../../../lib/i18n';

interface RemoveFromStartupButtonProps {
  conflictId: string;
  /** Every entry launching this app; the service removes all of them in one call. */
  entries: readonly ConflictAutostartEntry[];
  className?: string;
}

/**
 * Removes every autostart entry for one app, on an explicit click only. The app
 * keeps running afterwards, so the watcher never clears the row - the button
 * latches to a done state itself instead of waiting to unmount.
 */
export function RemoveFromStartupButton({ conflictId, entries, className }: RemoveFromStartupButtonProps) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const handleClick = useCallback(async () => {
    setBusy(true);
    let ok = false;
    try {
      const res = await disableConflictAutostart(conflictId);
      // A null body is a transport failure, and a partial removal leaves the
      // app still starting with Windows, which the service reports as an error.
      ok = res !== null && !res.error;
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
      title={t('conflicts.modal.removeStartupEntry', { entry: entries.map(e => e.entryName).join(', ') })}
      onClick={handleClick}
    >
      {entries.length > 0 && entries.every(e => e.kind === 'service')
        ? t('conflicts.modal.removeStartupService')
        : t('conflicts.modal.removeStartup')}
    </Button>
  );
}
