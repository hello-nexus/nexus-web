import { useEffect, useRef, useState } from 'react';
import { useTranslation } from '../../../../lib/i18n';
import { REMINDER_LIMITS, type ReminderDto, type ReminderListDto, type ReminderPatch, type ReminderPriority } from '../../../../api/reminders';
import { Overlay } from '../../../../components/common/Overlay/Overlay';
import { Button } from '../../../../components/common/Button/Button';
import { TextInput } from '../../../../components/common/TextInput/TextInput';
import { Toggle } from '../../../../components/common/Toggle/Toggle';
import { Select } from '../../../../components/common/Select/Select';
import { DatePicker } from '../../../../components/common/DatePicker/DatePicker';
import { ChipGroup } from '../../../../components/common/ChipGroup/ChipGroup';
import { useStackOnOverflow } from '../../../../components/common/ConfirmModal/useStackOnOverflow';
import { isoDate } from '../reminderLogic';
import { errorKeyFor } from './ReminderListEditor';
import styles from './ReminderModal.module.scss';

const DEFAULT_TIME = '09:00';
const URL_PLACEHOLDER = 'https://example.com';
const WEB_URL = /^https?:\/\/\S+$/i;

const PRIORITY_KEYS: Record<ReminderPriority, string> = {
  0: 'reminders.priority.none',
  1: 'reminders.priority.low',
  2: 'reminders.priority.medium',
  3: 'reminders.priority.high',
};
const PRIORITIES: readonly ReminderPriority[] = [0, 1, 2, 3];
const MARKS: Record<ReminderPriority, string> = { 0: '', 1: '!', 2: '!!', 3: '!!!' };

export const isWebUrl = (value: string): boolean => {
  const v = value.trim();
  if (v === '') return true;
  if (v.length > REMINDER_LIMITS.url || !WEB_URL.test(v)) return false;
  try { new URL(v); return true; } catch { return false; }
};

/** The fields of `draft` that differ from `item`, as a service patch. */
export function detailsPatch(item: ReminderDto, draft: {
  dueDate: string | null; dueTime: string | null; priority: ReminderPriority; flagged: boolean; url: string; listId: string;
}): ReminderPatch {
  const patch: ReminderPatch = {};
  if (draft.dueDate !== item.dueDate) patch.dueDate = draft.dueDate;
  const time = draft.dueDate ? draft.dueTime : null;
  if (time !== item.dueTime) patch.dueTime = time;
  if (draft.priority !== item.priority) patch.priority = draft.priority;
  if (draft.flagged !== item.flagged) patch.flagged = draft.flagged;
  const url = draft.url.trim() === '' ? null : draft.url.trim();
  if (url !== item.url) patch.url = url;
  if (draft.listId !== item.listId) patch.listId = draft.listId;
  return patch;
}

interface Props {
  item: ReminderDto | null;
  lists: readonly ReminderListDto[];
  onSave: (id: string, patch: ReminderPatch) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onClose: () => void;
}

/** A reminder's details: due date with optional time, priority, flag, URL and list. */
export function ReminderDetailsModal({ item, lists, onSave, onDelete, onClose }: Props) {
  const { t } = useTranslation();
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [dueTime, setDueTime] = useState<string | null>(null);
  const [priority, setPriority] = useState<ReminderPriority>(0);
  const [flagged, setFlagged] = useState(false);
  const [url, setUrl] = useState('');
  const [listId, setListId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const actionsRef = useRef<HTMLDivElement>(null);
  const open = item !== null;
  useStackOnOverflow(actionsRef, styles.stacked, open);

  useEffect(() => {
    if (!item) return;
    setDueDate(item.dueDate);
    setDueTime(item.dueTime);
    setPriority(item.priority);
    setFlagged(item.flagged);
    setUrl(item.url ?? '');
    setListId(item.listId);
    setError(null);
    setBusy(false);
    // Reset when another reminder opens, not on every store refresh of the same one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id]);

  if (!item) return null;

  const patch = detailsPatch(item, { dueDate, dueTime, priority, flagged, url, listId });
  const urlOk = isWebUrl(url);
  const canSave = !busy && urlOk && Object.keys(patch).length > 0;

  const run = async (job: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await job();
      onClose();
    } catch (e) {
      setError(t(errorKeyFor(e)));
      setBusy(false);
    }
  };

  return (
    <Overlay
      open
      onClose={onClose}
      variant="alert"
      onEnter={() => { if (canSave) void run(() => onSave(item.id, patch)); }}
      backdropClassName={styles.backdrop}
      className={styles.modal}
      ariaLabel={t('reminders.details.title')}
    >
      <h2 className={styles.title}>{t('reminders.details.title')}</h2>
      <div className={styles.body}>
        <div className={styles.row}>
          <span className={styles.label}>{t('reminders.details.date')}</span>
          <div className={styles.rowEnd}>
            {dueDate !== null && <DatePicker value={dueDate} onChange={setDueDate} ariaLabel={t('reminders.details.date')} />}
            <Toggle
              checked={dueDate !== null}
              ariaLabel={t('reminders.details.date')}
              onChange={on => { setDueDate(on ? isoDate(Date.now()) : null); if (!on) setDueTime(null); }}
            />
          </div>
        </div>
        <div className={styles.row}>
          <span className={styles.label}>{t('reminders.details.time')}</span>
          <div className={styles.rowEnd}>
            {dueTime !== null && (
              <input
                type="time"
                className={styles.time}
                value={dueTime}
                aria-label={t('reminders.details.time')}
                onChange={e => { if (e.target.value) setDueTime(e.target.value); }}
              />
            )}
            <Toggle
              checked={dueTime !== null}
              disabled={dueDate === null}
              ariaLabel={t('reminders.details.time')}
              onChange={on => setDueTime(on ? DEFAULT_TIME : null)}
            />
          </div>
        </div>
        <div className={styles.field}>
          <span className={styles.label}>{t('reminders.details.priority')}</span>
          <ChipGroup
            ariaLabel={t('reminders.details.priority')}
            fullWidth
            activeKey={String(priority)}
            onChange={key => setPriority(Number(key) as ReminderPriority)}
            options={PRIORITIES.map(p => ({ key: String(p), label: MARKS[p] || t(PRIORITY_KEYS[p]), ariaLabel: t(PRIORITY_KEYS[p]) }))}
          />
        </div>
        <div className={styles.row}>
          <span className={styles.label}>{t('reminders.details.flag')}</span>
          <Toggle checked={flagged} ariaLabel={t('reminders.details.flag')} onChange={setFlagged} />
        </div>
        <div className={styles.field}>
          <span className={styles.label}>{t('reminders.details.url')}</span>
          <TextInput
            value={url}
            placeholder={URL_PLACEHOLDER}
            maxLength={REMINDER_LIMITS.url}
            ariaLabel={t('reminders.details.url')}
            onInput={setUrl}
            invalid={!urlOk}
            autoComplete="off"
          />
          {!urlOk && <p className={styles.error} role="alert">{t('reminders.details.urlInvalid')}</p>}
        </div>
        <div className={styles.field}>
          <span className={styles.label}>{t('reminders.details.list')}</span>
          <Select
            value={listId}
            ariaLabel={t('reminders.details.list')}
            options={lists.map(l => ({ value: l.id, label: l.name }))}
            onChange={setListId}
          />
        </div>
        {error && <p className={styles.error} role="alert">{error}</p>}
      </div>
      <div ref={actionsRef} className={styles.actions}>
        <Button tone="neutral" size="md" onClick={onClose}>{t('confirm.cancel')}</Button>
        <div className={styles.actionsEnd}>
          <Button tone="danger" size="md" disabled={busy} onClick={() => { void run(() => onDelete(item.id)); }}>
            {t('reminders.details.delete')}
          </Button>
          <Button tone="accent" size="md" disabled={!canSave} loading={busy} onClick={() => { void run(() => onSave(item.id, patch)); }}>
            {t('reminders.details.save')}
          </Button>
        </div>
      </div>
    </Overlay>
  );
}
