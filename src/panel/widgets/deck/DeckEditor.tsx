import { useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import { DndContext, PointerSensor, useSensor, useSensors, closestCenter, type DragEndEvent } from '@dnd-kit/core';
import { useTranslation } from '../../../lib/i18n';
import { ConfirmModal } from '../../../components/common/ConfirmModal/ConfirmModal';
import { countBoundSlots, padSlots, pageHasContent, MAX_DECK_PAGES } from './deckLayout';
import { withPageIndicatorDisplay } from './deckIcons';
import { resolveTargetView, slotCountAtDepth, type DeckTarget } from './deckTarget';
import { DeckGrid } from './DeckGrid';
import { DeckKeyInspector } from './DeckKeyInspector';
import { DeckPageStrip } from './DeckPageStrip';
import type { PanelSurface } from '../../types';
import styles from './DeckEditor.module.scss';

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export interface DeckEditorProps {
  target: DeckTarget;
  page: number;
  /** Changes the current page. Implementations must reset folderPath to root as part of this call (page and folder nav are orthogonal, but a folder path rarely resolves across pages). */
  onPageChange: (page: number) => void;
  folderPath: readonly number[];
  onFolderPathChange: (folderPath: number[]) => void;
  selectedSlot?: number;
  onSelectedSlotChange?: (slot: number) => void;
  surface?: PanelSurface;
  desktopEditor?: boolean;
}

/**
 * Shared grid + inspector for one Deck target (the touch widget or a
 * physical Stream Deck). The touch widget renders its own grid elsewhere
 * (the live tile), so DeckEditor only adds the inspector for it - unchanged
 * from the pre-extraction DeckSettings. A physical target has no other tile
 * to click, so DeckEditor renders the grid (with drag-reorder + the
 * reserved Back key inside a folder) too. The device page's split layout
 * places DeckGrid and DeckKeyInspector in separate panes instead of using
 * this component directly - see StreamDeckDevicePage.
 */
export function DeckEditor({ target, page: pageProp, onPageChange, folderPath, onFolderPathChange, selectedSlot, onSelectedSlotChange, surface, desktopEditor }: DeckEditorProps) {
  const { t } = useTranslation();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const inFolder = folderPath.length > 0;
  const viewCount = slotCountAtDepth(target, folderPath.length);
  const pageCount = target.config.pages.length;
  // A preset switch can land on a page index the newly fitted config no
  // longer has (fewer pages than the previous preset) - clamp here so the
  // grid never renders an out-of-range blank page.
  const page = clamp(pageProp, 0, Math.max(0, pageCount - 1));
  const viewSlots = withPageIndicatorDisplay(
    resolveTargetView(target, page, folderPath) ?? padSlots([], viewCount),
    page,
    pageCount,
  );
  const selSlot = clamp(selectedSlot ?? 0, 0, Math.max(0, viewCount - 1));
  // The folder key awaiting delete confirmation, pinned by the full address
  // (page + folder path + index) it was requested at, so the confirm can only
  // ever clear the key the user was shown. A plain key clears straight away
  // (same rule as the device page's grid).
  const [deleteConfirm, setDeleteConfirm] = useState<
    { page: number; folderPath: readonly number[]; index: number; count: number } | null
  >(null);

  const onDragEnd = (e: DragEndEvent) => {
    const from = Number(e.active.id);
    const to = e.over ? Number(e.over.id) : NaN;
    if (!Number.isFinite(from) || !Number.isFinite(to) || from === to) return;
    target.swapSlots(page, folderPath, from, to);
  };

  const onBack = () => { onFolderPathChange(folderPath.slice(0, -1)); onSelectedSlotChange?.(0); };

  const onDeleteSlot = () => {
    const folder = viewSlots[selSlot]?.folder;
    const count = folder ? countBoundSlots(folder.slots) : 0;
    if (count > 0) setDeleteConfirm({ page, folderPath, index: selSlot, count });
    else target.updateSlot(page, folderPath, selSlot, {});
  };

  const onSelectPage = (p: number) => {
    onPageChange(p);
    onSelectedSlotChange?.(0);
  };

  return (
    <div className={styles.root}>
      <DeckPageStrip
        pageCount={pageCount}
        currentPage={page}
        onSelectPage={onSelectPage}
        onAddPage={() => { if (pageCount >= MAX_DECK_PAGES) return; target.addPage(); onSelectPage(pageCount); }}
        onRemoveCurrentPage={() => onSelectPage(target.removePage(page))}
        currentPageHasContent={pageHasContent(target.config.pages[page] ?? { slots: [] })}
        removeCount={target.removePageKeyCount(page)}
        canRemove={target.authoredPageCount > 1}
      />

      {inFolder && (
        <div className={styles.breadcrumb}>
          <button onClick={onBack}>
            <ChevronLeft size={14} /> {t('panel.settings.deck.back')}
          </button>
        </div>
      )}

      {target.kind === 'physical' && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <div className={styles.gridBox}>
            <DeckGrid
              slots={viewSlots}
              cols={target.cols}
              rows={target.rows}
              square
              selectable
              dragEnabled
              selectedIndex={selSlot}
              onCell={i => onSelectedSlotChange?.(i)}
              backCell={inFolder ? { onBack, ariaLabel: t('panel.settings.deck.back') } : undefined}
            />
          </div>
        </DndContext>
      )}

      <DeckKeyInspector
        target={target}
        page={page}
        folderPath={folderPath}
        onFolderPathChange={onFolderPathChange}
        selectedSlot={selectedSlot}
        onSelectedSlotChange={onSelectedSlotChange}
        surface={surface}
        desktopEditor={desktopEditor}
        onDeleteSlot={onDeleteSlot}
      />

      <ConfirmModal
        open={!!deleteConfirm}
        title={t('panel.settings.deck.deleteFolder.title')}
        message={t('panel.settings.deck.deleteFolder.body', { count: deleteConfirm?.count ?? 0 })}
        destructive
        onConfirm={() => {
          if (deleteConfirm) target.updateSlot(deleteConfirm.page, deleteConfirm.folderPath, deleteConfirm.index, {});
          setDeleteConfirm(null);
        }}
        onCancel={() => setDeleteConfirm(null)}
      />
    </div>
  );
}
