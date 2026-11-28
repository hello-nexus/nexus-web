import { useEffect, useMemo, useState } from 'react';
import { CircleCheck } from 'lucide-react';
import { Spinner } from '../../../components/common/Spinner/Spinner';
import type { WidgetProps } from '../types';
import { surfaceSupportsTouch } from '../../types';
import { useTranslation } from '../../../lib/i18n';
import { useReminderMutations } from '../../../hooks/useReminders';
import { useElementSize } from '../common/useElementSize';
import { useCalendarFormat } from '../calendar/useCalendarFormat';
import { SMART_COLORS, SMART_NAME_KEYS } from './reminderIcons';
import {
  buildView, dueLabel, dueMs, isPendingId, openCountOf, resolveSelection, selectionKey, smartCounts, type ReminderSelection,
} from './reminderLogic';
import { ReminderRow } from './ReminderRow';
import { ReminderCardGrid, ReminderListRow } from './ReminderTiles';
import { useCheckOff, useReminderData } from './useReminderData';
import styles from './RemindersImmersive.module.scss';

/**
 * Fullscreen reminders. With touch: smart-list tiles and My Lists beside the
 * selected list, items checkable. Display-only panels show the widget's
 * configured list, since they cannot switch.
 */
export function RemindersImmersive({ widget, surface, deviceTouch }: WidgetProps) {
  const { t } = useTranslation();
  const fmt = useCalendarFormat();
  const { ref, size } = useElementSize();
  const landscape = !size || size.width >= size.height;
  const interactive = surfaceSupportsTouch(surface ?? 'desktop', deviceTouch);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  const config = widget.config;
  const showCompleted = config?.showCompleted === true;
  const data = useReminderData({ enabled: true, preview: false, now });
  const { setCompleted } = useReminderMutations();
  const { leaving, toggle } = useCheckOff(setCompleted);

  const configured = resolveSelection(config?.list, data.lists);
  const [picked, setPicked] = useState<ReminderSelection | null>(null);
  const selection = interactive && picked ? picked : configured;
  const counts = useMemo(() => smartCounts(data.items, now), [data.items, now]);
  const view = useMemo(
    () => buildView(data.items, data.lists, selection, { now, showCompleted: selection.kind === 'list' && showCompleted }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- selection is rebuilt each render; its kind and id are its identity
    [data.items, data.lists, selection.kind, selection.id, now, showCompleted],
  );
  const listsById = useMemo(() => new Map(data.lists.map(l => [l.id, l])), [data.lists]);

  const list = selection.kind === 'list' ? listsById.get(selection.id) : undefined;
  const title = list ? list.name : t(SMART_NAME_KEYS[selection.kind === 'smart' ? selection.id : 'all']);
  const color = list ? list.color : SMART_COLORS[selection.kind === 'smart' ? selection.id : 'all'];
  const activeKey = selectionKey(selection);
  const empty = view.groups.length === 0 && view.completed.length === 0;

  const renderItems = (items: typeof view.completed) => items.map(item => (
    <ReminderRow
      key={item.id}
      item={item}
      color={listsById.get(item.listId)?.color ?? SMART_COLORS.all}
      due={dueLabel(item, now, t, fmt)}
      leaving={leaving.has(item.id)}
      onToggle={interactive && !isPendingId(item.id) ? () => toggle(item) : undefined}
      showNotes
    />
  ));

  if (data.unavailable) {
    return (
      <div ref={ref} className={`${styles.root} ${styles.portrait}`}>
        <div className={styles.empty} role="alert">{t('reminders.error.unavailable')}</div>
      </div>
    );
  }

  if (!data.loaded) {
    return (
      <div ref={ref} className={`${styles.root} ${styles.portrait}`}>
        <div className={styles.empty}><Spinner size={28} /></div>
      </div>
    );
  }

  return (
    <div ref={ref} className={`${styles.root} ${landscape ? styles.landscape : styles.portrait}`}>
      {interactive && (
        <nav className={styles.side} aria-label={t('reminders.lists')}>
          <ReminderCardGrid
            counts={counts}
            active={selection.kind === 'smart' ? selection.id : null}
            onSelect={id => setPicked({ kind: 'smart', id })}
            columns={landscape ? 2 : 3}
            layout="stack"
            className={styles.tiles}
          />
          <div className={styles.myLists}>
            <div className={styles.sectionTitle}>{t('reminders.myLists')}</div>
            {data.lists.map(l => (
              <ReminderListRow
                key={l.id}
                list={l}
                count={openCountOf(data.items, l.id)}
                active={activeKey === l.id}
                onPress={isPendingId(l.id) ? undefined : () => setPicked({ kind: 'list', id: l.id })}
              />
            ))}
          </div>
        </nav>
      )}
      <section className={styles.main}>
        <div className={styles.header}>
          <h2 className={styles.title} style={{ color }}>{title}</h2>
          <span className={styles.total}>{view.openCount}</span>
        </div>
        <div className={styles.rows}>
          {empty && (
            <div className={styles.empty}>
              <CircleCheck size="2em" aria-hidden />
              <span>{t('reminders.widget.allDone')}</span>
            </div>
          )}
          {view.groups.map(g => (
            <div key={g.key} className={styles.group}>
              {g.kind !== 'plain' && (
                <div className={`${styles.groupTitle} ${g.kind === 'overdue' ? styles.overdue : ''}`}>
                  {g.kind === 'overdue' ? t('reminders.group.overdue')
                    : g.kind === 'date' && g.date ? fmt.fullDate(dueMs(g.date, null))
                    : (g.listId ? listsById.get(g.listId)?.name : '')}
                </div>
              )}
              {renderItems(g.items)}
            </div>
          ))}
          {view.completed.length > 0 && (
            <div className={styles.group}>
              <div className={styles.groupTitle}>{t('reminders.group.completed')}</div>
              {renderItems(view.completed)}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

export default RemindersImmersive;
