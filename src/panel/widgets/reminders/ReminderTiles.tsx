import type { CSSProperties, ReactNode } from 'react';
import { useTranslation } from '../../../lib/i18n';
import type { ReminderListDto } from '../../../api/reminders';
import { Card } from '../../../components/common/Card/Card';
import { SMART_COLORS, SMART_ICONS, SMART_NAME_KEYS } from './reminderIcons';
import { ReminderIconGlyph } from './ReminderIconGlyph';
import { SMART_LISTS, type ReminderCounts, type SmartListId } from './reminderLogic';
import styles from './ReminderTiles.module.scss';

const tint = (color: string) => ({ '--rem-color': color }) as CSSProperties;

export type CardLayout = 'row' | 'stack';

interface CardProps {
  id: SmartListId;
  count: number;
  active?: boolean;
  onPress?: () => void;
  // row: icon, name and count on one line. stack: icon and count above the name.
  layout?: CardLayout;
  // Hidden labels stay readable to assistive tech.
  showLabel?: boolean;
}

/** One smart list as a card: its icon in the category color, the name and the open count. The one card the page, widget and immersive view share. */
export function ReminderCard({ id, count, active, onPress, layout = 'row', showLabel = true }: CardProps) {
  const { t } = useTranslation();
  const Icon = SMART_ICONS[id];
  return (
    <Card
      compact
      interactive={onPress !== undefined}
      onClick={onPress}
      pressed={onPress ? active === true : undefined}
      selected={active === true}
      className={`${styles.card} ${layout === 'stack' ? styles.stack : ''}`}
    >
      <span className={styles.icon} style={{ color: SMART_COLORS[id] }}><Icon size="1.4em" aria-hidden /></span>
      <span className={showLabel ? styles.name : styles.srOnly}>{t(SMART_NAME_KEYS[id])}</span>
      <span className={styles.count}>{count}</span>
    </Card>
  );
}

interface GridProps {
  counts: ReminderCounts;
  active?: SmartListId | null;
  onSelect?: (id: SmartListId) => void;
  columns: number;
  layout?: CardLayout;
  showLabels?: boolean;
  className?: string;
}

/** The six smart-list cards in a grid of `columns`. */
export function ReminderCardGrid({ counts, active, onSelect, columns, layout, showLabels = true, className }: GridProps) {
  return (
    <div className={`${styles.cards} ${className ?? ''}`} style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
      {SMART_LISTS.map(id => (
        <ReminderCard
          key={id}
          id={id}
          count={counts[id]}
          active={active === id}
          onPress={onSelect ? () => onSelect(id) : undefined}
          layout={layout}
          showLabel={showLabels}
        />
      ))}
    </div>
  );
}

interface ListRowProps {
  list: ReminderListDto;
  count: number;
  active?: boolean;
  onPress?: () => void;
  trailing?: ReactNode;
}

/** One user list row: its icon (list color for a Lucide icon), name and open count. */
export function ReminderListRow({ list, count, active, onPress, trailing }: ListRowProps) {
  const body = (
    <>
      <span className={styles.listGlyph} style={{ color: list.color }}><ReminderIconGlyph iconKey={list.icon} /></span>
      <span className={styles.listName}>{list.name}</span>
      <span className={styles.listCount}>{count}</span>
    </>
  );
  return (
    <div className={`${styles.listRow} ${active ? styles.listActive : ''}`} style={tint(list.color)}>
      {onPress
        ? <button type="button" className={styles.listMain} aria-pressed={active === true} onClick={onPress}>{body}</button>
        : <div className={styles.listMain}>{body}</div>}
      {trailing}
    </div>
  );
}
