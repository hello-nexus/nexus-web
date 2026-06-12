import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { DndContext, PointerSensor, useSensor, useSensors, closestCenter, type DragEndEvent } from '@dnd-kit/core';
import type { WidgetProps } from '../types';
import { DeckGrid } from './DeckGrid';
import { innerGridForSize, readDeckConfig, resolveViewSlots, padSlots, swapSlots, deckConfigPatch } from './deckLayout';
import { executeDeckAction } from './deckExecutor';
import { useDeckLiveState } from './useDeckState';
import { autoIconName, deckCategory, categoryColor } from './deckIcons';
import { usePanelPreview } from '../common/PanelPreviewContext';
import { DECK_PREVIEW_CONFIG } from './deckPreviewData';
import type { DeckAction, DeckSlot } from './types';
import styles from './DeckGrid.module.scss';

export function DeckWidget({ widget, selectedSlot, onSelectSlot, editView, onEditViewChange, onUpdate }: WidgetProps) {
  const { t } = useTranslation();
  const preview = usePanelPreview();
  const parsed = readDeckConfig(widget);
  const deck = preview && parsed.slots.length === 0 ? DECK_PREVIEW_CONFIG : parsed;
  const { cols, rows, count } = innerGridForSize(widget.size);
  const editing = typeof onSelectSlot === 'function';
  const live = useDeckLiveState(deck, !editing && !preview);
  const [internalFolder, setInternalFolder] = useState<number[]>([]);
  const [flips, setFlips] = useState<Record<string, boolean>>({});
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const controlled = editing && !!editView && !!onEditViewChange;
  const folderPath = controlled ? editView!.folderPath : internalFolder;
  const setFolderPath = (fp: number[]) => (controlled ? onEditViewChange!({ folderPath: fp }) : setInternalFolder(fp));

  const resolved = resolveViewSlots(deck, folderPath, count);
  const inFolder = resolved != null && folderPath.length > 0;
  const slots = resolved ?? resolveViewSlots(deck, [], count) ?? padSlots([], count);

  // Reset a stale folder path (folder removed by a resize) in run mode.
  useEffect(() => {
    if (!controlled && resolved == null && folderPath.length > 0) setInternalFolder([]);
  }, [controlled, resolved, folderPath.length]);

  const keyFor = (i: number) => `${folderPath.join('.')}:${i}`;

  const toggleOn = (action: Extract<DeckAction, { type: 'toggle' }>, key: string): boolean => {
    const liveOn = live.isOn(action.state);
    return liveOn !== undefined ? liveOn : (flips[key] ?? false);
  };

  // Reflect a toggle's live state in glyph/color when no explicit icon is set.
  const displaySlots: DeckSlot[] = useMemo(() => {
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
  }, [slots, flips, live]);

  const onCell = (i: number) => {
    if (editing) { onSelectSlot?.(i); return; }
    const slot = slots[i];
    if (slot.folder) { setFolderPath([...folderPath, i]); return; }
    const a = slot.action;
    if (!a) return;
    if (a.type === 'toggle') {
      const key = keyFor(i);
      const target = !toggleOn(a, key);
      if (live.isOn(a.state) === undefined) setFlips(prev => ({ ...prev, [key]: target }));
      void executeDeckAction(target ? a.on : a.off);
      return;
    }
    void executeDeckAction(a);
  };

  const onDragEnd = (e: DragEndEvent) => {
    if (!onUpdate) return;
    const from = Number(e.active.id);
    const to = e.over ? Number(e.over.id) : NaN;
    if (!Number.isFinite(from) || !Number.isFinite(to) || from === to) return;
    onUpdate(deckConfigPatch(swapSlots(deck, folderPath, from, to, count)));
  };

  const grid = (
    <DeckGrid
      slots={editing ? slots : displaySlots}
      cols={cols}
      rows={rows}
      selectable={editing}
      dragEnabled={editing}
      selectedIndex={selectedSlot}
      onCell={onCell}
    />
  );

  return (
    <div className={styles.root}>
      {inFolder ? (
        <button type="button" className={styles.back} aria-label={t('panel.settings.deck.back')} onClick={e => { e.stopPropagation(); setFolderPath(folderPath.slice(0, -1)); }}>
          {/* eslint-disable-next-line i18next/no-literal-string -- ARIA boolean attribute */}
          <ChevronLeft aria-hidden="true" />
        </button>
      ) : null}
      {editing
        ? <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>{grid}</DndContext>
        : grid}
    </div>
  );
}

export default DeckWidget;
