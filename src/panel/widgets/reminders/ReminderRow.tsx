import type { CSSProperties, ReactNode } from 'react';
import { Flag } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import type { ReminderDto } from '../../../api/reminders';
import { HoverTooltip } from '../../../components/common/HoverTooltip/HoverTooltip';
import { priorityMarks, type DueLabel } from './reminderLogic';
import styles from './ReminderRow.module.scss';

interface CheckProps {
  checked: boolean;
  color: string;
  label: string;
  onToggle?: () => void;
}

/** The hollow circle checkbox, tinted by its list. Without onToggle it is display only. */
export function ReminderCheck({ checked, color, label, onToggle }: CheckProps) {
  const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      disabled={!onToggle}
      className={`${styles.check} ${checked ? styles.checked : ''}`}
      style={{ '--rem-color': color } as CSSProperties}
      onPointerDown={stop}
      onPointerUp={stop}
      onClick={e => { e.stopPropagation(); onToggle?.(); }}
    >
      <span className={styles.ring} aria-hidden />
    </button>
  );
}

interface Props {
  item: ReminderDto;
  color: string;
  due: DueLabel | null;
  // Shown checked while the row waits to leave.
  leaving?: boolean;
  // Completing is allowed where the surface takes touch or a pointer.
  onToggle?: () => void;
  // The list name under the title, where rows from several lists mix.
  listName?: string;
  showNotes?: boolean;
  // Makes the title and meta lines a button that opens the row's editor.
  onEdit?: () => void;
  // Replaces the title and meta lines, for the page's inline editor.
  children?: ReactNode;
  trailing?: ReactNode;
}

/** One reminder: check circle, title with priority marks, notes and due line, flag. Shared by the tile, the immersive view and the page. */
export function ReminderRow({ item, color, due, leaving, onToggle, listName, showNotes, onEdit, children, trailing }: Props) {
  const { t } = useTranslation();
  const checked = item.completed || leaving === true;
  const marks = priorityMarks(item.priority);
  return (
    <div className={`${styles.row} ${leaving ? styles.leaving : ''} ${item.completed ? styles.done : ''}`}>
      <ReminderCheck checked={checked} color={color} label={item.title} onToggle={onToggle} />
      <div
        className={`${styles.body} ${onEdit && !children ? styles.editable : ''}`}
        role={onEdit && !children ? 'button' : undefined}
        tabIndex={onEdit && !children ? 0 : undefined}
        onClick={onEdit && !children ? onEdit : undefined}
        onKeyDown={onEdit && !children ? e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onEdit(); } } : undefined}
      >
        {children ?? (
          <>
            <div className={styles.titleLine}>
              {marks && <span className={styles.marks}>{marks}</span>}
              <span className={styles.title}>{item.title}</span>
            </div>
            {showNotes && item.notes && <div className={styles.notes}>{item.notes}</div>}
            {(due || listName) && (
              <div className={styles.meta}>
                {due && <span className={due.overdue ? styles.overdue : undefined}>{due.text}</span>}
                {listName && <span>{listName}</span>}
              </div>
            )}
          </>
        )}
      </div>
      {item.flagged && (
        <HoverTooltip body={t('reminders.flagged')}>
          <span className={styles.flag}><Flag size={12} aria-label={t('reminders.flagged')} /></span>
        </HoverTooltip>
      )}
      {trailing}
    </div>
  );
}
