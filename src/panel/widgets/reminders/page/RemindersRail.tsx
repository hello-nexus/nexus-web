import { Pencil, Plus } from 'lucide-react';
import { useTranslation } from '../../../../lib/i18n';
import type { ReminderDto, ReminderListDto } from '../../../../api/reminders';
import { Button } from '../../../../components/common/Button/Button';
import { IconLabelButton } from '../../../../components/common/IconLabelButton/IconLabelButton';
import { openCountOf, selectionKey, type ReminderCounts, type ReminderSelection } from '../reminderLogic';
import { ReminderListRow, SmartListGrid } from '../ReminderTiles';
import styles from './RemindersRail.module.scss';

interface Props {
  counts: ReminderCounts;
  lists: readonly ReminderListDto[];
  items: readonly ReminderDto[];
  selection: ReminderSelection;
  onSelect: (selection: ReminderSelection) => void;
  onAdd: () => void;
  onEdit: (list: ReminderListDto) => void;
}

/** The page rail: the smart-list grid, then My Lists with an edit button per list and Add List. */
export function RemindersRail({ counts, lists, items, selection, onSelect, onAdd, onEdit }: Props) {
  const { t } = useTranslation();
  const activeKey = selectionKey(selection);
  return (
    <aside className={styles.rail} aria-label={t('reminders.lists')}>
      <SmartListGrid
        counts={counts}
        active={selection.kind === 'smart' ? selection.id : null}
        onSelect={id => onSelect({ kind: 'smart', id })}
        className={styles.grid}
      />
      <div className={styles.head}>
        <span className={styles.heading}>{t('reminders.myLists')}</span>
        <Button size="sm" tone="neutral" icon={<Plus size={16} aria-hidden />} onClick={onAdd}>
          {t('reminders.list.add.button')}
        </Button>
      </div>
      <div className={styles.lists}>
        {lists.map(list => (
          <ReminderListRow
            key={list.id}
            list={list}
            count={openCountOf(items, list.id)}
            active={activeKey === list.id}
            onPress={() => onSelect({ kind: 'list', id: list.id })}
            trailing={(
              <IconLabelButton
                variant="bare"
                icon={<Pencil size={15} aria-hidden />}
                ariaLabel={t('reminders.list.edit.button', { name: list.name })}
                title={t('reminders.list.edit.title')}
                onPress={() => onEdit(list)}
              />
            )}
          />
        ))}
      </div>
    </aside>
  );
}
