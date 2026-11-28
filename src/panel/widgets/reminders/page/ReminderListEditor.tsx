import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from '../../../../lib/i18n';
import { REMINDER_LIMITS, ReminderRequestError, type ReminderListDto } from '../../../../api/reminders';
import { useReminderMutations } from '../../../../hooks/useReminders';
import { Overlay } from '../../../../components/common/Overlay/Overlay';
import { Button } from '../../../../components/common/Button/Button';
import { TextInput } from '../../../../components/common/TextInput/TextInput';
import { ColorPickerWithPresets } from '../../../../components/common/ColorPickerWithPresets/ColorPickerWithPresets';
import { ConfirmModal } from '../../../../components/common/ConfirmModal/ConfirmModal';
import { useStackOnOverflow } from '../../../../components/common/ConfirmModal/useStackOnOverflow';
import { CALENDAR_COLORS } from '../../calendar/page/CalendarSourceModal';
import { IconPicker } from '../../common/IconPicker';
import { DEFAULT_REMINDER_ICON, keyFromPicker, pickerValueFor } from '../reminderIcons';
import { ReminderIconGlyph } from '../ReminderIconGlyph';
import { nextListColor } from '../reminderLogic';
import styles from './ReminderModal.module.scss';

const PICKER_PLACEMENT = 'top-end' as const;
const PICKER_TABS = ['icons', 'emoji'] as const;

export const REMINDER_COLORS: readonly string[] = CALENDAR_COLORS;

export function errorKeyFor(e: unknown): string {
  const code = e instanceof ReminderRequestError ? e.code : null;
  switch (code) {
    case 'limitReached': return 'reminders.error.limitReached';
    case 'invalid': return 'reminders.error.invalid';
    case 'lastList': return 'reminders.list.delete.lastList';
    case 'notFound': return 'reminders.error.notFound';
    case 'unavailable': return 'reminders.error.unavailable';
    case 'stale': return 'reminders.error.stale';
    case 'saveFailed': return 'reminders.error.generic';
    default: return 'reminders.error.generic';
  }
}

interface Props {
  // 'new' opens the Add List dialog; a list opens it in edit mode with Delete.
  target: 'new' | ReminderListDto | null;
  lists: readonly ReminderListDto[];
  onClose: () => void;
  // Called with the list a successful add created.
  onCreated?: (list: ReminderListDto) => void;
  // Called after a delete, so the page can leave the deleted list.
  onDeleted?: (id: string) => void;
}

/** Add a list, or edit its name, color and icon, or delete it after a confirm. */
export function ReminderListEditor({ target, lists, onClose, onCreated, onDeleted }: Props) {
  const { t } = useTranslation();
  const { createList, updateList, deleteList } = useReminderMutations();
  const editing = target !== null && target !== 'new' ? target : null;
  const open = target !== null;
  const [name, setName] = useState('');
  const [color, setColor] = useState(REMINDER_COLORS[0]);
  const [customColor, setCustomColor] = useState('');
  const [icon, setIcon] = useState(DEFAULT_REMINDER_ICON);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const attempt = useRef(0);
  const actionsRef = useRef<HTMLDivElement>(null);
  const errorId = useId();
  useStackOnOverflow(actionsRef, styles.stacked, open && !deleting);

  useEffect(() => {
    if (!open) return;
    attempt.current += 1;
    const start = editing?.color ?? nextListColor(lists.map(l => l.color), REMINDER_COLORS);
    setName(editing?.name ?? '');
    setColor(start);
    setCustomColor(REMINDER_COLORS.includes(start.toLowerCase()) ? '' : start);
    setIcon(editing?.icon ?? DEFAULT_REMINDER_ICON);
    setError(null);
    setBusy(false);
    setDeleting(false);
    // Reset only on the closed to open edge, or when another list is opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing?.id]);

  if (!open) return null;

  const trimmed = name.trim();
  const changed = editing === null
    || trimmed !== editing.name || color.toLowerCase() !== editing.color.toLowerCase() || icon !== editing.icon;
  const canSubmit = !busy && trimmed !== '' && changed;

  const submit = async () => {
    if (!canSubmit) return;
    const mine = attempt.current;
    setBusy(true);
    setError(null);
    try {
      if (editing) await updateList(editing.id, { name: trimmed, color, icon });
      else onCreated?.(await createList({ name: trimmed, color, icon }));
      if (attempt.current === mine) onClose();
    } catch (e) {
      if (attempt.current !== mine) return;
      setError(t(errorKeyFor(e)));
      setBusy(false);
    }
  };

  const title = t(editing ? 'reminders.list.edit.title' : 'reminders.list.add.title');

  return (
    <>
      <Overlay
        open={!deleting}
        onClose={onClose}
        variant="alert"
        onEnter={() => { void submit(); }}
        backdropClassName={styles.backdrop}
        className={styles.modal}
        ariaLabel={title}
      >
        <h2 className={styles.title}>{title}</h2>
        <div className={styles.body}>
          <div className={styles.field}>
            <span className={styles.label}>{t('reminders.list.name')}</span>
            <TextInput
              value={name}
              placeholder={t('reminders.list.namePlaceholder')}
              maxLength={REMINDER_LIMITS.listName}
              ariaLabel={t('reminders.list.name')}
              onInput={value => { setName(value); setError(null); }}
              invalid={error !== null}
              autoComplete="off"
            />
            {error && <p id={errorId} className={styles.error} role="alert">{error}</p>}
          </div>
          <div className={styles.field}>
            <span className={styles.label}>{t('reminders.list.color')}</span>
            <ColorPickerWithPresets
              value={color}
              presets={REMINDER_COLORS}
              onCommit={setColor}
              allowCustom
              customColor={customColor || undefined}
              onCustomCommit={setCustomColor}
              pickerPortal
              pickerPlacement={PICKER_PLACEMENT}
              className={styles.swatches}
            />
          </div>
          <div className={styles.field}>
            <span className={styles.label}>
              {t('reminders.list.icon')}
              <span className={styles.iconPreview} style={{ color }}><ReminderIconGlyph iconKey={icon} /></span>
            </span>
            <IconPicker
              tabs={PICKER_TABS}
              desktopEditor
              value={pickerValueFor(icon)}
              onChange={choice => { if (choice) setIcon(keyFromPicker(choice)); }}
            />
          </div>
        </div>
        <div ref={actionsRef} className={styles.actions}>
          <Button tone="neutral" size="md" onClick={onClose}>{t('confirm.cancel')}</Button>
          <div className={styles.actionsEnd}>
            {editing && (
              <Button tone="danger" size="md" onClick={() => { setError(null); setDeleting(true); }} disabled={busy}>
                {t('reminders.list.delete.title')}
              </Button>
            )}
            <Button tone="accent" size="md" onClick={() => { void submit(); }} disabled={!canSubmit} loading={busy}>
              {t(editing ? 'reminders.list.edit.save' : 'reminders.list.add.confirm')}
            </Button>
          </div>
        </div>
      </Overlay>
      <ConfirmModal
        open={deleting}
        title={t('reminders.list.delete.title')}
        message={t('reminders.list.delete.message', { name: editing?.name ?? '' })}
        confirmLabel={t('reminders.list.delete.confirm')}
        confirmDisabled={busy}
        onConfirm={() => {
          if (!editing) return;
          setBusy(true);
          deleteList(editing.id)
            .then(() => { onDeleted?.(editing.id); onClose(); })
            .catch(e => {
              // Back to the edit dialog, which says the list is still there.
              setDeleting(false);
              setError(t(errorKeyFor(e)));
            })
            .finally(() => setBusy(false));
        }}
        onCancel={() => { if (!busy) setDeleting(false); }}
      />
    </>
  );
}
