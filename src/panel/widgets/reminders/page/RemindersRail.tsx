import { Pencil, Plus } from 'lucide-react';
import { useTranslation } from '../../../../lib/i18n';
import type { ReminderDto, ReminderListDto } from '../../../../api/reminders';
import { Button } from '../../../../components/common/Button/Button';
import { IconLabelButton } from '../../../../components/common/IconLabelButton/IconLabelButton';
import { SectionHeader } from '../../../../components/common/SectionHeader/SectionHeader';
import { isPendingId, openCountOf, SMART_LISTS, type ReminderCounts, type ReminderSelection } from '../reminderLogic';
import { ReminderListRow } from '../ReminderTiles';
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

/** The page rail: the smart lists, then My Lists with an edit button per list and Add List. One row across both is selected. */
export function RemindersRail({ counts, lists, items, selection, onSelect, onAdd, onEdit }: Props) {
  const { t } = useTranslation();
  const activeKey = selection.kind === 'list' ? selection.id : null;
  return (
    <aside className={styles.rail} aria-label={t('reminders.lists')}>
      <div className={styles.head}>
        <SectionHeader>{t('panel.widget.reminders')}</SectionHeader>
      </div>
      <div className={`${styles.lists} ${styles.smart}`}>
        {SMART_LISTS.map(id => (
          <ReminderListRow
            key={id}
            smart={id}
            count={counts[id]}
            active={selection.kind === 'smart' && selection.id === id}
            onPress={() => onSelect({ kind: 'smart', id })}
          />
        ))}
      </div>
      <div className={styles.head}>
        <SectionHeader>{t('reminders.myLists')}</SectionHeader>
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
            onPress={isPendingId(list.id) ? undefined : () => onSelect({ kind: 'list', id: list.id })}
            trailing={isPendingId(list.id) ? undefined : (
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
