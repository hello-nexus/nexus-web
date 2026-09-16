import { Fragment, useState, type CSSProperties, type ReactNode } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MeasuringStrategy,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useTranslation } from '../../../../lib/i18n';
import { useUnitPrefs } from '../../../../hooks/useUiSettings';
import { localizeNumbers } from '../../../../lib/units';
import { EffectCard } from '../../../../components/common/EffectCard/EffectCard';
import type { MediaItem } from '../../../../api/mediaLibrary';
import styles from '../LightingPage.module.scss';

// A press on the card's delete button never starts a drag.
const offButton = (target: EventTarget | null) => !(target as HTMLElement | null)?.closest('button');

class CardMouseSensor extends MouseSensor {
  static activators = [{
    eventName: 'onMouseDown' as const,
    handler: ({ nativeEvent: event }: { nativeEvent: MouseEvent }) => event.button === 0 && offButton(event.target),
  }];
}

// TouchSensor, not PointerSensor: the touch panels scroll this grid with the
// same finger, and only a touchmove listener can preventDefault the pan once
// the hold has activated (a pointer drag gets pointercancel and dies).
class CardTouchSensor extends TouchSensor {
  static activators = [{
    eventName: 'onTouchStart' as const,
    handler: ({ nativeEvent: event }: { nativeEvent: TouchEvent }) => offButton(event.target),
  }];
}

function useCardSensors() {
  return useSensors(
    useSensor(CardMouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(CardTouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
}

/** The id list after dropping `activeId` on `overId`; unchanged when either is unknown. */
export function reorderMediaIds(ids: readonly string[], activeId: string, overId: string): string[] {
  const from = ids.indexOf(activeId);
  const to = ids.indexOf(overId);
  return from === -1 || to === -1 || from === to ? ids.slice() : arrayMove(ids.slice(), from, to);
}

function mediaCardMeta(item: MediaItem, t: (key: string) => string, numberFormat: Parameters<typeof localizeNumbers>[1]): string {
  return item.type === 'animated'
    ? `${localizeNumbers((item.frames / Math.max(item.fps, 1)).toFixed(1), numberFormat)}s`
    : t('lighting.controls.mediaStatic');
}

// The wrapper is the activator, so a keyboard drag starts only from the
// wrapper itself: Enter on the card's delete button stays a delete. The card
// inside is already role=button, so the wrapper keeps only the sortable a11y.
function SortableMediaCard({ id, children }: { id: string; children: ReactNode }) {
  const { setNodeRef, setActivatorNodeRef, transform, transition, attributes, listeners, isDragging } = useSortable({ id });
  const sortableAttributes: Record<string, unknown> = { ...attributes };
  delete sortableAttributes.role;
  delete sortableAttributes['aria-pressed'];
  const style: CSSProperties = { transform: CSS.Transform.toString(transform), transition };
  return (
    <div
      ref={el => { setNodeRef(el); setActivatorNodeRef(el); }}
      style={style}
      className={`${styles.mediaSortable} ${isDragging ? styles.mediaCardDragging : ''}`}
      {...sortableAttributes}
      {...listeners}
    >
      {children}
    </div>
  );
}

/**
 * Pure presenter for the media library grid. `onDelete` is optional - the
 * desktop MediaControls passes it (with a confirm flow); the immersive
 * read-only picker omits it. `prepend` lets the desktop slot an "importing…"
 * placeholder card at the front. `onReorder` makes the cards draggable and
 * reports the new id order on a drop.
 */
export function MediaGrid({ items, activeId, thumbs, onPlay, onDelete, deleteAriaLabel, prepend, thumbAspect, onReorder }: {
  items: MediaItem[];
  activeId: string | null;
  thumbs: Record<string, string>;
  onPlay: (id: string) => void;
  onDelete?: (id: string, label: string) => void;
  deleteAriaLabel?: string;
  prepend?: ReactNode;
  thumbAspect?: number;
  onReorder?: (ids: string[]) => void;
}) {
  const { t } = useTranslation();
  const { numberFormat } = useUnitPrefs();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const sensors = useCardSensors();

  const card = (item: MediaItem) => {
    const label = item.name.replace(/\.[^.]+$/, '');
    return (
      <EffectCard
        asDiv
        label={label}
        thumbUrl={thumbs[item.id] ?? null}
        active={item.id === activeId}
        onClick={() => onPlay(item.id)}
        meta={mediaCardMeta(item, t, numberFormat)}
        onDelete={onDelete ? () => onDelete(item.id, label) : undefined}
        deleteAriaLabel={deleteAriaLabel}
        ariaLabel={label}
        thumbAspect={thumbAspect}
      />
    );
  };

  if (!onReorder) {
    return (
      <div className={styles.mediaGrid}>
        {prepend}
        {items.map(item => <Fragment key={item.id}>{card(item)}</Fragment>)}
      </div>
    );
  }

  const ids = items.map(item => item.id);
  const onDragEnd = (e: DragEndEvent) => {
    setDraggingId(null);
    if (!e.over || e.active.id === e.over.id) return;
    onReorder(reorderMediaIds(ids, String(e.active.id), String(e.over.id)));
  };
  const dragging = draggingId ? items.find(item => item.id === draggingId) : undefined;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      onDragStart={e => setDraggingId(String(e.active.id))}
      onDragEnd={onDragEnd}
      onDragCancel={() => setDraggingId(null)}
    >
      <SortableContext items={ids} strategy={rectSortingStrategy}>
        <div className={styles.mediaGrid}>
          {prepend}
          {items.map(item => (
            <SortableMediaCard key={item.id} id={item.id}>{card(item)}</SortableMediaCard>
          ))}
        </div>
      </SortableContext>
      <DragOverlay dropAnimation={null}>
        {dragging && <div className={styles.mediaDragOverlay}>{card(dragging)}</div>}
      </DragOverlay>
    </DndContext>
  );
}
