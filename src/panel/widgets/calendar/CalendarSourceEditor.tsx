import { useState } from 'react';
import { useTranslation } from '../../../lib/i18n';
import type { CalendarSourceDto } from '../../../api/calendar';
import { useCalendarMutations } from '../../../hooks/useCalendar';
import { ConfirmModal } from '../../../components/common/ConfirmModal/ConfirmModal';
import { CalendarSourceModal } from './page/CalendarSourceModal';

interface Props {
  source: CalendarSourceDto | null;
  usedColors: readonly string[];
  onClose: () => void;
}

/** Edit a calendar's name and color, or remove it after a confirm. One flow for the page rail and the widget settings. */
export function CalendarSourceEditor({ source, usedColors, onClose }: Props) {
  const { t } = useTranslation();
  const { update, remove } = useCalendarMutations();
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <>
      <CalendarSourceModal
        open={source !== null && !removing}
        source={source}
        usedColors={usedColors}
        onSave={async patch => { setRemoveError(null); await update(source!.id, patch); onClose(); }}
        onRemove={() => { setRemoveError(null); setRemoving(true); }}
        notice={removeError}
        onClose={() => { setRemoveError(null); onClose(); }}
      />
      <ConfirmModal
        open={source !== null && removing}
        title={t('panel.widget.calendar.remove.title')}
        message={t('panel.widget.calendar.remove.message', { name: source?.name ?? '' })}
        confirmLabel={t('panel.widget.calendar.remove.confirm')}
        confirmDisabled={busy}
        onConfirm={() => {
          const id = source?.id;
          if (!id) return;
          setBusy(true);
          remove(id)
            .then(() => { setRemoving(false); onClose(); })
            .catch(() => {
              // Back to the edit dialog, which says the calendar is still there.
              setRemoving(false);
              setRemoveError(t('panel.widget.calendar.remove.error'));
            })
            .finally(() => setBusy(false));
        }}
        onCancel={() => { if (!busy) setRemoving(false); }}
      />
    </>
  );
}
