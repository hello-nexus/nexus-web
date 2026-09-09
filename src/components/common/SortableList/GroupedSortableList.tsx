import { useState, type CSSProperties, type ReactNode } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MeasuringStrategy,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { bodyDroppableId, containerOf, dropContainer, moveTo, sameArrangement, TAIL, type Arrangement } from './groupedDrag';
import { type SortableRowArgs } from './SortableList';
import styles from './SortableList.module.scss';

/**
 * Two-level drag list: top-level rows (cards and group headers) plus one nested
 * list per group, all under ONE DndContext so a row can be dragged into, out of
 * and between groups. {@link SortableList} stays the choice for a flat list - it
 * owns its own context, so two of them can never exchange rows.
 *
 * The dragged row MOVES between containers as the pointer crosses them, which is
 * what makes rows shift and animate the way they do in a plain list: the row's
 * own gap is the preview, wherever it currently sits. The transfer fires only
 * when the container actually changes; reordering inside one container is
 * dnd-kit's own preview and is committed on drop. Doing it on every pointer
 * move instead resizes the container the row just left, which re-measures,
 * flips the target back and loops forever.
 *
 * Nesting is one level: a group row reorders among its siblings and never
 * enters another group.
 */
export interface GroupedSortableListProps {
  arrangement: Arrangement;
  /** Receives the whole new arrangement after a drop. */
  onArrange: (next: Arrangement) => void;
  renderBlock: (id: string, args: SortableRowArgs) => ReactNode;
  /** Renders the group shell; `children` is its nested list. `isDropTarget` is
   *  true while the dragged row is sitting inside this group. */
  renderGroup: (id: string, args: SortableRowArgs, children: ReactNode, isDropTarget: boolean) => ReactNode;
  className?: string;
  ariaLabel?: string;
}

// Same guard SortableList uses: a press inside [data-no-dnd] (buttons, the
// inline name editor) never starts a drag.
class GuardedPointerSensor extends PointerSensor {
  static activators = [
    {
      eventName: 'onPointerDown' as const,
      handler: ({ nativeEvent: event }: { nativeEvent: PointerEvent }) => {
        if (!event.isPrimary || event.button !== 0) return false;
        let el = event.target as HTMLElement | null;
        while (el) {
          if (el.dataset && el.dataset.noDnd === 'true') return false;
          el = el.parentElement;
        }
        return true;
      },
    },
  ];
}

function Row({ id, render }: { id: string; render: (id: string, args: SortableRowArgs) => ReactNode }) {
  const { setNodeRef, transform, transition, attributes, listeners, isDragging } = useSortable({ id });
  // The dragged row's own gap snaps; only the rows it displaces animate. When
  // it changes container it is inserted at one slot and previewed at another
  // (dnd-kit puts a row hovering a tall neighbour on that neighbour's far
  // side), and animating that correction reads as the gap flying across the
  // rail before settling.
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: isDragging ? undefined : transition,
  };
  return <>{render(id, {
    ref: setNodeRef,
    style,
    attributes: attributes as unknown as Record<string, unknown>,
    listeners: listeners as unknown as Record<string, unknown> | undefined,
    isDragging,
    placeholderClassName: styles.placeholder,
  })}</>;
}

/**
 * The strip under the last row, live only while something is being dragged. It
 * is the only way to reach "top level, at the very bottom" when the last row is
 * a group, since the group itself owns every pixel it covers.
 */
function DropTail() {
  const { setNodeRef } = useDroppable({ id: TAIL });
  return <div ref={setNodeRef} className={styles.dropTail} aria-hidden />;
}

/**
 * A group's body. The droppable is what lets a group with no members take a
 * row; once one is dragged in, the row itself is the landing spot, so nothing
 * fake is ever drawn.
 */
function GroupBody({ groupId, members, renderBlock }: {
  groupId: string;
  members: string[];
  renderBlock: GroupedSortableListProps['renderBlock'];
}) {
  const { setNodeRef } = useDroppable({ id: bodyDroppableId(groupId) });
  return (
    <SortableContext items={members} strategy={verticalListSortingStrategy}>
      <div ref={setNodeRef} className={styles.list} role="list">
        {members.map(id => <Row key={id} id={id} render={renderBlock} />)}
      </div>
    </SortableContext>
  );
}

export function GroupedSortableList({
  arrangement, onArrange, renderBlock, renderGroup, className, ariaLabel,
}: GroupedSortableListProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  // The arrangement as it stands mid-drag. Only cross-container moves write to
  // it; within one container dnd-kit previews the reorder itself.
  const [working, setWorking] = useState<Arrangement | null>(null);
  const live = working ?? arrangement;

  const sensors = useSensors(
    useSensor(GuardedPointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Pointer position resolves "the container under the cursor" far more
  // reliably than comparing rect centres, which made a short group hard to hit.
  const collisionDetection: CollisionDetection = args => {
    const within = pointerWithin(args);
    return within.length > 0 ? within : closestCenter(args);
  };

  const onDragOver = (e: DragOverEvent) => {
    const { active, over } = e;
    if (!over) return;
    const movingId = String(active.id);
    const overId = String(over.id);
    if (movingId in live.groupMembers) return; // a group never enters a group
    const from = containerOf(live, movingId);
    const to = dropContainer(live, overId);
    if (to === null || from === to) return;    // same container: dnd-kit previews it
    const next = moveTo(live, movingId, overId);
    if (!sameArrangement(live, next)) setWorking(next);
  };

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    const next = over ? moveTo(live, String(active.id), String(over.id)) : live;
    setActiveId(null);
    setWorking(null);
    if (!sameArrangement(arrangement, next)) onArrange(next);
  };

  // The group the dragged row is sitting in right now, so its shell can say so.
  const insideGroup = activeId !== null && !(activeId in live.groupMembers)
    ? (id: string) => containerOf(live, activeId) === id
    : () => false;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      modifiers={[restrictToVerticalAxis]}
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      onDragStart={(e: DragStartEvent) => { setActiveId(String(e.active.id)); setWorking(arrangement); }}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={() => { setActiveId(null); setWorking(null); }}
    >
      <SortableContext items={live.rowIds} strategy={verticalListSortingStrategy}>
        <div
          className={[styles.list, styles.groupedList, className].filter(Boolean).join(' ')}
          aria-label={ariaLabel}
          role="list"
        >
          {live.rowIds.map(id => id in live.groupMembers
            ? (
              <Row key={id} id={id} render={(rowId, args) => renderGroup(
                rowId,
                args,
                <GroupBody groupId={rowId} members={live.groupMembers[rowId] ?? []} renderBlock={renderBlock} />,
                insideGroup(rowId),
              )} />
            )
            : <Row key={id} id={id} render={renderBlock} />)}
          {activeId !== null && <DropTail />}
        </div>
      </SortableContext>
      <DragOverlay dropAnimation={null}>
        {activeId !== null && (
          <div className={`${styles.overlay} ${styles.overlayOpaque}`}>
            {activeId in live.groupMembers
              ? renderGroup(activeId, {
                  ref: () => {}, style: {}, attributes: {}, listeners: undefined,
                  isDragging: false, placeholderClassName: styles.placeholder,
                }, null, false)
              : renderBlock(activeId, {
                  ref: () => {}, style: {}, attributes: {}, listeners: undefined,
                  isDragging: false, placeholderClassName: styles.placeholder,
                })}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

export default GroupedSortableList;
