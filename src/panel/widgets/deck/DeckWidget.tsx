import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { DndContext, PointerSensor, useSensor, useSensors, closestCenter, type DragEndEvent } from '@dnd-kit/core';
import type { WidgetProps } from '../types';
import { DeckGrid } from './DeckGrid';
import { innerGridForSize, fitToGrid, resolveViewSlots, padSlots, emptyDeck } from './deckLayout';
import { useDeckInstance } from './useDeckInstance';
import { executeDeckAction, isPrivilegedDeckAction } from './deckExecutor';
import { useDeckLiveState } from './useDeckState';
import { toggleBranchSlot, withPageIndicatorDisplay } from './deckIcons';
import { usePanelPreview } from '../common/PanelPreviewContext';
import { DECK_PREVIEW_CONFIG } from './deckPreviewData';
import { useRecentApps } from './useRecentApps';
import { buildRecentAppsView } from './recentAppsView';
import { RecentAppsGrid } from './RecentAppsGrid';
import type { DeckAction, DeckConfig, DeckSlot } from './types';
import styles from './DeckGrid.module.scss';

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export function DeckWidget({ widget, deviceId, selectedSlot, onSelectSlot, editView, onEditViewChange }: WidgetProps) {
  const { t } = useTranslation();
  const preview = usePanelPreview();
  const { cols, rows, count } = innerGridForSize(widget.size);
  const editing = typeof onSelectSlot === 'function';
  const instanceId = preview ? null : `widget:${widget.id}`;
  const instance = useDeckInstance(instanceId, 'widget', { cols, rows }, false);
  const preset = instance.preset;
  const target = instance.target;

  // Recent Apps has no per-key content to fit/edit - every key is the live
  // ring, rendered by RecentAppsGrid instead of the fitToGrid/DndContext path
  // below. Hooks stay unconditional; only the render branches on mode.
  const showRecentApps = !preview && instance.instance?.mode === 'recentApps';
  const recentApps = useRecentApps(showRecentApps);
  const recentPages = useMemo(
    () => buildRecentAppsView(recentApps.apps, recentApps.focusedProcessKey, cols, rows),
    [recentApps.apps, recentApps.focusedProcessKey, cols, rows],
  );

  // target.cols/rows/keyCount always equal this widget's own inner grid
  // (useDeckInstance is given the same {cols, rows} as instanceGrid), so
  // editing and run mode render the identical fitted size - never the
  // authored grid crammed into this tile. Preview (add-widget catalog) skips
  // the live instance entirely.
  const gridCols = cols;
  const gridRows = rows;
  const gridCount = count;
  const deck: DeckConfig | null = useMemo(() => {
    if (preview) return DECK_PREVIEW_CONFIG;
    if (editing) return target?.config ?? null;
    if (!preset) return null;
    return fitToGrid({ cols: preset.cols, rows: preset.rows, deck: preset.deck }, { cols, rows, kind: 'widget' });
  }, [preview, editing, target, preset, cols, rows]);

  const live = useDeckLiveState(deck ?? emptyDeck(), !editing && !preview);
  const [internalFolder, setInternalFolder] = useState<number[]>([]);
  const [internalPage, setInternalPage] = useState(0);
  const [flips, setFlips] = useState<Record<string, boolean>>({});
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const controlled = editing && !!editView && !!onEditViewChange;
  const maxPage = Math.max(0, (deck?.pages.length ?? 1) - 1);
  const page = clamp(controlled ? editView!.page : internalPage, 0, maxPage);
  const folderPath = controlled ? editView!.folderPath : internalFolder;
  const setFolderPath = (fp: number[]) => (controlled ? onEditViewChange!({ page, folderPath: fp }) : setInternalFolder(fp));
  // Page nav resets folderPath to root (page and folder are orthogonal, but a
  // folder path from one page rarely resolves on another).
  const setPage = (p: number) => {
    const next = clamp(p, 0, maxPage);
    if (controlled) onEditViewChange!({ page: next, folderPath: [] });
    else { setInternalPage(next); setInternalFolder([]); }
  };

  const resolved = deck ? resolveViewSlots(deck, page, folderPath, gridCount) : null;
  const inFolder = resolved != null && folderPath.length > 0;
  const slots = resolved ?? (deck ? resolveViewSlots(deck, page, [], gridCount) : null) ?? padSlots([], gridCount);

  // Reset a stale folder path (folder removed by a resize) in run mode.
  useEffect(() => {
    if (!controlled && deck && resolved == null && folderPath.length > 0) setInternalFolder([]);
  }, [controlled, deck, resolved, folderPath.length]);

  const keyFor = (i: number) => `${page}:${folderPath.join('.')}:${i}`;

  const toggleOn = (action: Extract<DeckAction, { type: 'toggle' }>, key: string): boolean => {
    const liveOn = live.isOn(action.state);
    return liveOn !== undefined ? liveOn : (flips[key] ?? false);
  };

  // Reflect the current page count/index (pageIndicator) and a toggle's live
  // state (run mode only) in glyph/color/label when no explicit icon is set.
  const displaySlots: DeckSlot[] = useMemo(() => {
    const withIndicator = withPageIndicatorDisplay(slots, page, deck?.pages.length ?? 1);
    if (editing) return withIndicator;
    return withIndicator.map((s, i) => {
      if (s.action?.type !== 'toggle') return s;
      const on = toggleOn(s.action, keyFor(i));
      return toggleBranchSlot(s, s.action, on);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots, flips, live, page, deck, editing]);

  // A privileged action routes through /panel/deck/dispatch so the service
  // executes the STORED slot server-side instead of taking its parameters
  // (file path / key chord / text / audio file) over the wire. No deviceId
  // (the desktop dashboard's own "My Computer" preview, which has no backing
  // panel device record) keeps every action on its unchanged direct route.
  const dispatchAction = (action: DeckAction, i: number, branch?: 'on' | 'off') => {
    if (deviceId && isPrivilegedDeckAction(action)) {
      const location = { deviceId, widgetId: widget.id, page, folderPath, slot: i };
      if (branch) void executeDeckAction(action, location, branch);
      else void executeDeckAction(action, location);
      return;
    }
    void executeDeckAction(action);
  };

  const onCell = (i: number) => {
    if (editing) { onSelectSlot?.(i); return; }
    if (!deck) return;
    const slot = slots[i];
    if (slot.folder) { setFolderPath([...folderPath, i]); return; }
    const a = slot.action;
    if (!a) return;
    if (a.type === 'toggle') {
      const key = keyFor(i);
      const target = !toggleOn(a, key);
      if (live.isOn(a.state) === undefined) setFlips(prev => ({ ...prev, [key]: target }));
      dispatchAction(target ? a.on : a.off, i, target ? 'on' : 'off');
      return;
    }
    if (a.type === 'page') {
      const total = deck.pages.length;
      if (a.op === 'next') setPage((page + 1) % total);
      else if (a.op === 'prev') setPage((page - 1 + total) % total);
      else setPage(a.target ?? 0);
      return;
    }
    if (a.type === 'pageIndicator') return;
    dispatchAction(a, i);
  };

  const onDragEnd = (e: DragEndEvent) => {
    if (!target) return;
    const from = Number(e.active.id);
    const to = e.over ? Number(e.over.id) : NaN;
    if (!Number.isFinite(from) || !Number.isFinite(to) || from === to) return;
    target.swapSlots(page, folderPath, from, to);
  };

  const grid = (
    <DeckGrid
      slots={displaySlots}
      cols={gridCols}
      rows={gridRows}
      selectable={editing}
      dragEnabled={editing}
      selectedIndex={selectedSlot}
      onCell={onCell}
    />
  );

  if (showRecentApps) {
    return (
      <div className={styles.root}>
        <RecentAppsGrid
          pages={recentPages}
          cols={cols}
          rows={rows}
          // Recent Apps has nothing to edit per key (the layout is dynamic,
          // not authored), so a tap while arranging the panel must not
          // switch to or launch an app.
          onPress={editing ? () => {} : processKey => void recentApps.activate(processKey)}
          ariaLabel={t('panel.settings.deck.mode.recentApps')}
        />
      </div>
    );
  }

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
