import { MiniMonth } from '../../../../components/common/MiniMonth/MiniMonth';
import { CalendarSourcesSections } from '../CalendarSourcesSections';
import styles from './CalendarRail.module.scss';

interface Props {
  miniMonth: number;
  selected: number;
  today: number;
  weekStart: 0 | 1;
  highlightWeek: boolean;
  onSelectDay: (day: number) => void;
  onMonthChange: (delta: number) => void;
  onSelectMonth: (monthStart: number) => void;
  hidden: readonly string[];
  onToggle: (id: string, visible: boolean) => void;
}

export function CalendarRail({
  miniMonth, selected, today, weekStart, highlightWeek, onSelectDay, onMonthChange, onSelectMonth, hidden, onToggle,
}: Props) {
  return (
    <aside className={styles.rail}>
      <div className={styles.mini}>
        <MiniMonth
          month={miniMonth}
          selected={selected}
          today={today}
          weekStart={weekStart}
          highlightWeek={highlightWeek}
          onSelect={onSelectDay}
          onMonthChange={onMonthChange}
          onSelectMonth={onSelectMonth}
        />
      </div>
      <CalendarSourcesSections hidden={hidden} onToggle={onToggle} canEdit />
    </aside>
  );
}
