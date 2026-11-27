import { useCallback, useEffect, useMemo, useState } from 'react';
import { CircleCheck, Info, Pencil } from 'lucide-react';
import { useTranslation } from '../../../../lib/i18n';
import { REMINDER_LIMITS, type ReminderDto, type ReminderListDto } from '../../../../api/reminders';
import { useReminderMutations, useReminders } from '../../../../hooks/useReminders';
import { Button } from '../../../../components/common/Button/Button';
import { ConfirmModal } from '../../../../components/common/ConfirmModal/ConfirmModal';
import { EmptyState } from '../../../../components/common/EmptyState/EmptyState';
import { Notice } from '../../../../components/common/Notice/Notice';
import { IconLabelButton } from '../../../../components/common/IconLabelButton/IconLabelButton';
import { Spinner } from '../../../../components/common/Spinner/Spinner';
import { Toggle } from '../../../../components/common/Toggle/Toggle';
import { SectionHeader } from '../../../../components/common/SectionHeader/SectionHeader';
import { SortableList } from '../../../../components/common/SortableList/SortableList';
import { TextInput } from '../../../../components/common/TextInput/TextInput';
import { ViewHeader } from '../../../../components/common/ViewHeader/ViewHeader';
import { useCalendarFormat } from '../../calendar/useCalendarFormat';
import { SMART_COLORS, SMART_NAME_KEYS } from '../reminderIcons';
import {
  buildView, dueLabel, dueMs, isPendingId, isViewEmpty, newItemDefaults, parseSelection, reorderableIds, selectedListId, SMART_LISTS, type SmartListId,
  smartCounts, type ReminderGroup, type ReminderSelection,
} from '../reminderLogic';
import { ReminderCheck, ReminderRow } from '../ReminderRow';
import { useCheckOff } from '../useReminderData';
import { ReminderDetailsModal } from './ReminderDetailsModal';
import { ReminderInlineEditor } from './ReminderInlineEditor';
import { errorKeyFor, ReminderListEditor } from './ReminderListEditor';
import { RemindersRail } from './RemindersRail';
import styles from './RemindersPage.module.scss';

const SHOW_COMPLETED_KEY = 'nexus.reminders.showCompleted';
const TODAY: ReminderSelection = { kind: 'smart', id: 'today' };

// The subtab is a smart-list id or a list id; a user list leaves every tab inactive.
const subtabOf = (s: ReminderSelection): string => s.id;
function selectionOf(tab: string | null | undefined, lists: readonly ReminderListDto[]): ReminderSelection {
  if (tab && (SMART_LISTS as readonly string[]).includes(tab)) return { kind: 'smart', id: tab as SmartListId };
  return parseSelection(tab, lists) ?? TODAY;
}

function readShowCompleted(): boolean {
  try {
    return window.localStorage.getItem(SHOW_COMPLETED_KEY) === '1';
  } catch {
    return false;
  }
}

function writeShowCompleted(on: boolean) {
  try {
    window.localStorage.setItem(SHOW_COMPLETED_KEY, on ? '1' : '0');
  } catch {
    // Storage unavailable: the choice lasts for this visit only.
  }
}

interface Props {
  tab?: string | null;
  onTabChange?: (tab: string) => void;
}

/** Desktop reminders page: smart lists and My Lists in a rail, the selected list in the main pane. */
export function RemindersPage({ tab, onTabChange }: Props) {
  const { t } = useTranslation();
  const fmt = useCalendarFormat();
  const { lists, items, loaded, unavailable } = useReminders();
  const { create, update, setCompleted, remove, clearCompleted, reorder } = useReminderMutations();
  const { leaving, toggle } = useCheckOff(setCompleted);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const [showCompleted, setShowCompleted] = useState(readShowCompleted);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [listTarget, setListTarget] = useState<'new' | ReminderListDto | null>(null);
  const [clearing, setClearing] = useState(false);
  const [draft, setDraft] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  const selection = selectionOf(tab, lists);
  const selectionId = subtabOf(selection);
  const listId = selectedListId(selection);
  const counts = useMemo(() => smartCounts(items, now), [items, now]);
  const view = useMemo(
    () => buildView(items, lists, selection, { now, showCompleted: showCompleted && listId !== null }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- selection is rebuilt each render; selectionId is its identity
    [items, lists, selectionId, now, showCompleted, listId],
  );
  const listsById = useMemo(() => new Map(lists.map(l => [l.id, l])), [lists]);
  const colorOf = (id: string) => listsById.get(id)?.color ?? SMART_COLORS.all;

  const list = listId ? listsById.get(listId) : undefined;
  const title = list ? list.name : t(SMART_NAME_KEYS[selection.kind === 'smart' ? selection.id : 'all']);
  const ringColor = list ? list.color : SMART_COLORS[selection.kind === 'smart' ? selection.id : 'all'];
  const doneInScope = listId !== null
    ? items.filter(i => i.completed && i.listId === listId).length
    : selection.kind === 'smart' && selection.id === 'completed' ? counts.completed : 0;
  const defaults = newItemDefaults(selection, lists, now);
  const detailsItem = detailsId ? items.find(i => i.id === detailsId) ?? null : null;

  const select = useCallback((next: ReminderSelection) => {
    setEditingId(null);
    setNotice(null);
    onTabChange?.(subtabOf(next));
  }, [onTabChange]);

  const fail = (e: unknown) => setNotice(t(errorKeyFor(e)));

  const add = () => {
    const text = draft.trim();
    if (!text || !defaults) return;
    setDraft('');
    setNotice(null);
    create({ ...defaults, title: text }).catch(e => { setDraft(text); fail(e); });
  };

  const commitEdit = (item: ReminderDto, nextTitle: string, nextNotes: string) => {
    setEditingId(null);
    const patch: { title?: string; notes?: string | null } = {};
    const trimmed = nextTitle.trim();
    if (trimmed && trimmed !== item.title) patch.title = trimmed;
    const notes = nextNotes.trim() === '' ? null : nextNotes;
    if (notes !== item.notes) patch.notes = notes;
    if (Object.keys(patch).length > 0) update(item.id, patch).catch(fail);
  };

  const renderRow = (item: ReminderDto, extra?: { listName?: string }) => {
    const editing = editingId === item.id;
    const inert = isPendingId(item.id);
    return (
      <ReminderRow
        key={item.id}
        item={item}
        color={colorOf(item.listId)}
        due={dueLabel(item, now, t, fmt)}
        leaving={leaving.has(item.id)}
        onToggle={inert ? undefined : () => toggle(item)}
        listName={extra?.listName}
        showNotes
        onEdit={inert ? undefined : () => setEditingId(item.id)}
        trailing={inert ? undefined : (
          <IconLabelButton
            variant="bare"
            icon={<Info size={16} aria-hidden />}
            ariaLabel={t('reminders.details.open', { name: item.title })}
            title={t('reminders.details.title')}
            onPress={() => setDetailsId(item.id)}
          />
        )}
      >
        {editing ? (
          <ReminderInlineEditor
            title={item.title}
            notes={item.notes ?? ''}
            onCommit={(nextTitle, nextNotes) => commitEdit(item, nextTitle, nextNotes)}
            onCancel={() => setEditingId(null)}
          />
        ) : undefined}
      </ReminderRow>
    );
  };

  const groupTitle = (g: ReminderGroup): string | null => {
    if (g.kind === 'overdue') return t('reminders.group.overdue');
    if (g.kind === 'date' && g.date) return fmt.fullDate(dueMs(g.date, null));
    if (g.kind === 'list' && g.listId) return listsById.get(g.listId)?.name ?? null;
    return null;
  };

  const sortable = listId !== null && view.groups.length === 1 && view.groups[0].kind === 'plain';
  const ids = reorderableIds(view);
  const byId = new Map(items.map(i => [i.id, i]));

  return (
    <div className={styles.page}>
      <ViewHeader title={t('panel.widget.reminders')} />
      <div className="pageBodyFill">
        <div className={styles.body}>
          <RemindersRail
            counts={counts}
            lists={lists}
            items={items}
            selection={selection}
            onSelect={select}
            onAdd={() => setListTarget('new')}
            onEdit={setListTarget}
          />
          <div className={styles.main}>
            {unavailable ? (
              <Notice tone="warning" role="alert">{t('reminders.error.unavailable')}</Notice>
            ) : !loaded ? (
              <div className={styles.loading}><Spinner size={28} /></div>
            ) : lists.length === 0 ? (
              <EmptyState
                icon={<CircleCheck size={32} />}
                title={t('reminders.empty.noLists')}
                action={<Button tone="accent" size="md" onClick={() => setListTarget('new')}>{t('reminders.list.add.button')}</Button>}
              />
            ) : (
              <>
                <div className={styles.toolbar}>
                  <SectionHeader className={styles.title}>{title}</SectionHeader>
                  {list && (
                    <IconLabelButton
                      variant="bare"
                      icon={<Pencil size={15} aria-hidden />}
                      ariaLabel={t('reminders.list.edit.button', { name: list.name })}
                      title={t('reminders.list.edit.title')}
                      onPress={() => setListTarget(list)}
                    />
                  )}
                </div>
                <div className={styles.subbar}>
                  {listId !== null && (
                    <label className={styles.showCompleted}>
                      <span>{t('reminders.showCompleted')}</span>
                      <Toggle checked={showCompleted} onChange={on => { setShowCompleted(on); writeShowCompleted(on); }} ariaLabel={t('reminders.showCompleted')} />
                    </label>
                  )}
                  <Button size="sm" tone="neutral" disabled={doneInScope === 0} onClick={() => setClearing(true)}>
                    {t('reminders.clearCompleted')}
                  </Button>
                </div>
                {notice && <p className={styles.error} role="alert">{notice}</p>}
                <div className={styles.scroll}>
                  {sortable ? (
                    <SortableList
                      ids={ids}
                      ariaLabel={title}
                      onReorder={next => { if (listId) reorder(listId, next).catch(fail); }}
                      renderRow={(id, args) => {
                        const item = byId.get(id);
                        if (!item) return null;
                        return (
                          <div
                            ref={args.ref}
                            style={args.style}
                            {...args.attributes}
                            {...args.listeners}
                            // Only the row itself starts a keyboard drag; keys typed in its editor or pressed on its buttons stay theirs.
                            onKeyDown={e => { if (e.target === e.currentTarget) (args.listeners?.onKeyDown as ((ev: typeof e) => void) | undefined)?.(e); }}
                            className={args.isDragging ? args.placeholderClassName : undefined}
                          >
                            {renderRow(item)}
                          </div>
                        );
                      }}
                    />
                  ) : (
                    view.groups.map(g => {
                      const heading = groupTitle(g);
                      return (
                        <div key={g.key} className={styles.group}>
                          {heading && <div className={`${styles.groupTitle} ${g.kind === 'overdue' ? styles.overdue : ''}`}>{heading}</div>}
                          {g.items.map(item => renderRow(item))}
                        </div>
                      );
                    })
                  )}
                  {view.completed.length > 0 && (
                    <div className={styles.group}>
                      <div className={styles.groupTitle}>{t('reminders.group.completed')}</div>
                      {view.completed.map(item => renderRow(item))}
                    </div>
                  )}
                  {defaults && (
                    <div className={styles.addRow}>
                      <ReminderCheck checked={false} color={ringColor} label={t('reminders.new')} />
                      <TextInput
                        value={draft}
                        size="sm"
                        maxLength={REMINDER_LIMITS.title}
                        placeholder={t('reminders.new')}
                        ariaLabel={t('reminders.new')}
                        onInput={setDraft}
                        onSubmit={add}
                        autoComplete="off"
                      />
                    </div>
                  )}
                  {selection.kind === 'smart' && isViewEmpty(view) && (
                    <p className={styles.emptyNote}>{t('reminders.page.emptySmart')}</p>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <ReminderListEditor
        target={listTarget}
        lists={lists}
        onClose={() => setListTarget(null)}
        onCreated={created => select({ kind: 'list', id: created.id })}
        onDeleted={id => { if (id === listId) select(TODAY); }}
      />
      <ReminderDetailsModal
        item={detailsItem}
        lists={lists}
        onSave={(id, patch) => update(id, patch)}
        onDelete={id => remove(id)}
        onClose={() => setDetailsId(null)}
      />
      <ConfirmModal
        open={clearing}
        title={t('reminders.clearCompleted')}
        message={t('reminders.clearCompleted.message')}
        confirmLabel={t('reminders.clearCompleted.confirm')}
        onConfirm={() => {
          setClearing(false);
          clearCompleted(listId ?? undefined).catch(fail);
        }}
        onCancel={() => setClearing(false)}
      />
    </div>
  );
}

export default RemindersPage;
