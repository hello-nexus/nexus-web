import { useEffect, useMemo, useState } from 'react';
import { CircleCheck } from 'lucide-react';
import { Spinner } from '../../../components/common/Spinner/Spinner';
import type { WidgetProps } from '../types';
import { surfaceSupportsTouch, widgetLayoutSize, type PanelWidgetSize } from '../../types';
import { useTranslation } from '../../../lib/i18n';
import { useReminderMutations } from '../../../hooks/useReminders';
import { usePanelPreview } from '../common/PanelPreviewContext';
import { useCalendarFormat } from '../calendar/useCalendarFormat';
import { SMART_COLORS, SMART_NAME_KEYS } from './reminderIcons';
import { buildView, dueLabel, isPendingId, openCountOf, resolveSelection, smartCounts, type ReminderSelection } from './reminderLogic';
import { ReminderRow } from './ReminderRow';
import { ReminderListRow, SmartListGrid } from './ReminderTiles';
import { previewNow, useCheckOff, useReminderData } from './useReminderData';
import styles from './RemindersWidget.module.scss';

const MAX_ROWS: Partial<Record<PanelWidgetSize, number>> = { '2x2': 3, '2x4': 6, '4x2': 3, '4x4': 9 };
const GRID_LISTS = 4;

/**
 * Reminders tile. List view shows one list's open items under its colored
 * title; grid view is the home grid of smart lists, with My Lists below at 4x4.
 * Checking an item off works wherever the surface takes touch or a pointer.
 */
export function RemindersWidget({ widget, surface, deviceTouch }: WidgetProps) {
  const { t } = useTranslation();
  const preview = usePanelPreview();
  const fmt = useCalendarFormat();
  const [realNow, setNow] = useState(() => Date.now());
  useEffect(() => {
    // Due labels and overdue flip on the minute.
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  const now = preview ? previewNow(realNow) : realNow;
  const config = widget.config;
  const size = widgetLayoutSize(widget.size);
  const grid = config?.viewMode === 'grid';
  const showCompleted = config?.showCompleted === true;
  const data = useReminderData({ enabled: true, preview, now });
  const { setCompleted } = useReminderMutations();
  const { leaving, toggle } = useCheckOff(setCompleted);
  const interactive = !preview && surfaceSupportsTouch(surface ?? 'desktop', deviceTouch);

  const selection: ReminderSelection = resolveSelection(config?.list, data.lists);
  const counts = useMemo(() => smartCounts(data.items, now), [data.items, now]);
  const view = useMemo(
    () => buildView(data.items, data.lists, selection, { now, showCompleted }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- selection is rebuilt each render; its key is its identity
    [data.items, data.lists, selection.kind, selection.id, now, showCompleted],
  );
  const colorOf = useMemo(() => {
    const byId = new Map(data.lists.map(l => [l.id, l.color]));
    return (listId: string) => byId.get(listId) ?? SMART_COLORS.all;
  }, [data.lists]);

  const root = `${styles.root} ${styles[`s-${size}`]}`;

  if (data.unavailable) {
    return <div className={root}><div className={styles.empty} role="alert">{t('reminders.error.unavailable')}</div></div>;
  }

  if (!data.loaded) {
    return <div className={root}><div className={styles.empty}><Spinner size={22} /></div></div>;
  }

  if (data.lists.length === 0) {
    return <div className={root}><div className={styles.empty}>{t('reminders.empty.noLists')}</div></div>;
  }

  if (grid) {
    return (
      <div className={root}>
        <SmartListGrid counts={counts} className={styles.grid} />
        {size === '4x4' && (
          <div className={styles.lists}>
            {data.lists.slice(0, GRID_LISTS).map(l => <ReminderListRow key={l.id} list={l} count={openCountOf(data.items, l.id)} />)}
          </div>
        )}
      </div>
    );
  }

  const list = selection.kind === 'list' ? data.lists.find(l => l.id === selection.id) : undefined;
  const title = list ? list.name : t(SMART_NAME_KEYS[selection.kind === 'smart' ? selection.id : 'all']);
  const color = list ? list.color : SMART_COLORS[selection.kind === 'smart' ? selection.id : 'all'];
  const rows = [...view.groups.flatMap(g => g.items), ...view.completed];
  const cap = MAX_ROWS[size] ?? 3;
  const shown = rows.slice(0, cap);

  return (
    <div className={root}>
      <div className={styles.header}>
        <span className={styles.title} style={{ color }}>{title}</span>
        <span className={styles.total}>{view.openCount}</span>
      </div>
      {rows.length === 0 ? (
        <div className={styles.empty}>
          <CircleCheck size="1.6em" aria-hidden />
          <span>{t('reminders.widget.allDone')}</span>
        </div>
      ) : (
        <div className={styles.rows}>
          {shown.map(item => (
            <ReminderRow
              key={item.id}
              item={item}
              color={colorOf(item.listId)}
              due={dueLabel(item, now, t, fmt)}
              leaving={leaving.has(item.id)}
              onToggle={interactive && !isPendingId(item.id) ? () => toggle(item) : undefined}
              listName={selection.kind === 'smart' && size === '4x4' ? data.lists.find(l => l.id === item.listId)?.name : undefined}
            />
          ))}
          {rows.length > shown.length && <div className={styles.more}>{t('reminders.widget.more', { count: rows.length - shown.length })}</div>}
        </div>
      )}
    </div>
  );
}

export default RemindersWidget;
