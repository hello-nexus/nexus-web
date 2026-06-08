import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import type { WidgetProps, DeckEditView } from '../types';
import { DeckGrid } from './DeckGrid';
import { innerGridForSize, readDeckConfig, resolveViewSlots, padSlots } from './deckLayout';
import { executeDeckAction } from './deckExecutor';
import { useDeckLiveState } from './useDeckState';
import { autoIconName, deckCategory, categoryColor } from './deckIcons';
import type { DeckAction, DeckSlot } from './types';
import styles from './DeckGrid.module.scss';

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export function DeckWidget({ widget, selectedSlot, onSelectSlot, editView, onEditViewChange }: WidgetProps) {
  const deck = readDeckConfig(widget);
  const { cols, rows, count } = innerGridForSize(widget.size);
  const editing = typeof onSelectSlot === 'function';
  const live = useDeckLiveState(deck, !editing);
  const [internalView, setInternalView] = useState<DeckEditView>({ pageIndex: 0, folderPath: [] });
  const [flips, setFlips] = useState<Record<string, boolean>>({});

  const controlled = editing && !!editView && !!onEditViewChange;
  const view = controlled ? editView! : internalView;
  const setView = controlled ? onEditViewChange! : setInternalView;

  const pageCount = deck.pages.length;
  const safePage = clamp(view.pageIndex, 0, pageCount - 1);
  const resolved = resolveViewSlots(deck, safePage, view.folderPath, count);
  const inFolder = resolved != null && view.folderPath.length > 0;
  const slots = resolved ?? resolveViewSlots(deck, safePage, [], count) ?? padSlots([], count);

  // Reset a stale view (folder removed by a resize, page deleted) in run mode.
  useEffect(() => {
    if (!controlled && (resolved == null || safePage !== view.pageIndex)) {
      setInternalView({ pageIndex: safePage, folderPath: resolved == null ? [] : view.folderPath });
    }
  }, [controlled, resolved, safePage, view.pageIndex, view.folderPath]);

  const keyFor = (i: number) => `${safePage}:${view.folderPath.join('.')}:${i}`;

  const toggleOn = (action: Extract<DeckAction, { type: 'toggle' }>, key: string): boolean => {
    const liveOn = live.isOn(action.state);
    return liveOn !== undefined ? liveOn : (flips[key] ?? false);
  };

  // Reflect a toggle's live state in its glyph/color when the user hasn't set an
  // explicit icon (e.g. mute shows VolumeX/Volume2).
  const displaySlots: DeckSlot[] = useMemo(() => {
    if (editing) return slots;
    return slots.map((s, i) => {
      if (s.action?.type !== 'toggle') return s;
      const on = toggleOn(s.action, keyFor(i));
      const branch = on ? s.action.on : s.action.off;
      return {
        ...s,
        icon: s.icon ?? { kind: 'lucide', value: autoIconName(branch) },
        color: s.color ?? categoryColor(deckCategory(branch)),
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots, editing, flips, live]);

  const onCell = (i: number) => {
    if (editing) { onSelectSlot?.(i); return; }
    const slot = slots[i];
    if (slot.folder) { setView({ pageIndex: safePage, folderPath: [...view.folderPath, i] }); return; }
    const a = slot.action;
    if (!a) return;
    switch (a.type) {
      case 'pageNext':
        if (!inFolder) setView({ pageIndex: clamp(safePage + 1, 0, pageCount - 1), folderPath: [] });
        return;
      case 'pagePrev':
        if (!inFolder) setView({ pageIndex: clamp(safePage - 1, 0, pageCount - 1), folderPath: [] });
        return;
      case 'pageGoto':
        if (!inFolder) setView({ pageIndex: clamp(a.page, 0, pageCount - 1), folderPath: [] });
        return;
      case 'toggle': {
        const key = keyFor(i);
        const cur = toggleOn(a, key);
        const target = !cur;
        if (live.isOn(a.state) === undefined) setFlips(prev => ({ ...prev, [key]: target }));
        void executeDeckAction(target ? a.on : a.off);
        return;
      }
      default:
        void executeDeckAction(a);
    }
  };

  const goBack = () => setView({ pageIndex: safePage, folderPath: view.folderPath.slice(0, -1) });

  return (
    <div className={styles.root}>
      {!editing && inFolder ? (
        <button type="button" className={styles.back} aria-label="Back" onClick={e => { e.stopPropagation(); goBack(); }}>
          <ChevronLeft aria-hidden="true" />
        </button>
      ) : null}
      <DeckGrid
        slots={displaySlots}
        cols={cols}
        rows={rows}
        showLabels={deck.showLabels === true}
        selectable={editing}
        selectedIndex={selectedSlot}
        onCell={onCell}
      />
      {!editing && !inFolder && pageCount > 1 ? (
        <div className={styles.pageDots}>
          {deck.pages.map((_, p) => (
            <span key={p} className={`${styles.pageDot} ${p === safePage ? styles.activeDot : ''}`} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default DeckWidget;
