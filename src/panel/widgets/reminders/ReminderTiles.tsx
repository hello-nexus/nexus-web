import type { CSSProperties, ReactNode } from 'react';
import { useTranslation } from '../../../lib/i18n';
import type { ReminderListDto } from '../../../api/reminders';
import { reminderIcon, SMART_COLORS, SMART_ICONS, SMART_NAME_KEYS, SMART_ROW_ICONS } from './reminderIcons';
import { SMART_LISTS, type ReminderCounts, type SmartListId } from './reminderLogic';
import styles from './ReminderTiles.module.scss';

const tint = (color: string) => ({ '--rem-color': color }) as CSSProperties;

interface TileProps {
  id: SmartListId;
  count: number;
  active?: boolean;
  onPress?: () => void;
}

/** One smart list: a tinted glyph, its open count and its name. A button when onPress is given. */
export function SmartListTile({ id, count, active, onPress }: TileProps) {
  const { t } = useTranslation();
  const Icon = SMART_ICONS[id];
  const content = (
    <>
      <span className={styles.disc}><Icon size="0.95em" aria-hidden /></span>
      <span className={styles.count}>{count}</span>
      <span className={styles.name}>{t(SMART_NAME_KEYS[id])}</span>
    </>
  );
  const cls = `${styles.tile} ${active ? styles.active : ''}`;
  if (!onPress) return <div className={cls} style={tint(SMART_COLORS[id])}>{content}</div>;
  return (
    <button type="button" className={cls} style={tint(SMART_COLORS[id])} aria-pressed={active === true} onClick={onPress}>
      {content}
    </button>
  );
}

interface GridProps {
  counts: ReminderCounts;
  active?: SmartListId | null;
  onSelect?: (id: SmartListId) => void;
  className?: string;
}

/** The Reminders home grid: Today, Scheduled, All, Flagged, Completed. */
export function SmartListGrid({ counts, active, onSelect, className }: GridProps) {
  return (
    <div className={`${styles.grid} ${className ?? ''}`}>
      {SMART_LISTS.map(id => (
        <SmartListTile key={id} id={id} count={counts[id]} active={active === id} onPress={onSelect ? () => onSelect(id) : undefined} />
      ))}
    </div>
  );
}

interface ListRowProps {
  // A user list: colored glyph disc and its name. A smart list: its plain icon and localized name.
  list?: ReminderListDto;
  smart?: SmartListId;
  count: number;
  active?: boolean;
  onPress?: () => void;
  trailing?: ReactNode;
}

/** One row of the list rail, user list or smart list, with its open count. */
export function ReminderListRow({ list, smart, count, active, onPress, trailing }: ListRowProps) {
  const { t } = useTranslation();
  const SmartIcon = smart ? SMART_ROW_ICONS[smart] : null;
  const Icon = list ? reminderIcon(list.icon) : null;
  const name = smart ? t(SMART_NAME_KEYS[smart]) : list?.name ?? '';
  const body = (
    <>
      {SmartIcon
        ? <span className={styles.listGlyph}><SmartIcon size="1.25em" aria-hidden /></span>
        : Icon && <span className={styles.listDisc}><Icon size="0.9em" aria-hidden /></span>}
      <span className={styles.listName}>{name}</span>
      <span className={styles.listCount}>{count}</span>
    </>
  );
  return (
    <div className={`${styles.listRow} ${active ? styles.listActive : ''}`} style={list ? tint(list.color) : undefined}>
      {onPress
        ? <button type="button" className={styles.listMain} aria-pressed={active === true} onClick={onPress}>{body}</button>
        : <div className={styles.listMain}>{body}</div>}
      {trailing}
    </div>
  );
}
