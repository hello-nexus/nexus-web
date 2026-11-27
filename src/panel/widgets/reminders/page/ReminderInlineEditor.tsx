import { useEffect, useRef, useState, type FocusEvent } from 'react';
import { useTranslation } from '../../../../lib/i18n';
import { TextInput } from '../../../../components/common/TextInput/TextInput';
import styles from './RemindersPage.module.scss';

const TITLE_MAX = 500;
const NOTES_MAX = 10000;

interface Props {
  title: string;
  notes: string;
  // Called once when focus leaves the editor or Enter is pressed; an unchanged or empty title is the caller's to ignore.
  onCommit: (title: string, notes: string) => void;
  onCancel: () => void;
}

/** Edits a row in place: title and notes. Leaving the editor saves; Escape discards. */
export function ReminderInlineEditor({ title, notes, onCommit, onCancel }: Props) {
  const { t } = useTranslation();
  const [titleDraft, setTitleDraft] = useState(title);
  const [notesDraft, setNotesDraft] = useState(notes);
  const ref = useRef<HTMLDivElement>(null);
  const done = useRef(false);

  useEffect(() => { ref.current?.querySelector('input')?.focus(); }, []);

  const commit = () => {
    if (done.current) return;
    done.current = true;
    onCommit(titleDraft, notesDraft);
  };
  const onBlur = (e: FocusEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) commit();
  };

  return (
    <div
      ref={ref}
      className={styles.editor}
      data-no-dnd="true"
      onBlur={onBlur}
      onKeyDown={e => {
        if (e.key === 'Escape') { e.stopPropagation(); done.current = true; onCancel(); }
      }}
    >
      <TextInput
        value={titleDraft}
        size="sm"
        maxLength={TITLE_MAX}
        ariaLabel={t('reminders.edit.title')}
        onInput={setTitleDraft}
        onSubmit={commit}
        autoComplete="off"
      />
      <textarea
        className={styles.notes}
        value={notesDraft}
        rows={2}
        maxLength={NOTES_MAX}
        placeholder={t('reminders.edit.notes')}
        aria-label={t('reminders.edit.notes')}
        onChange={e => setNotesDraft(e.target.value)}
      />
    </div>
  );
}
