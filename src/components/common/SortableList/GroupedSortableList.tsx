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
import { bodyDroppableId, dropContainer, moveTo, ROOT, sameArrangement, type Arrangement } from './groupedDrag';
import { type SortableRowArgs } from './SortableList';
import styles from './SortableList.module.scss';

/**
 * Two-level drag list: top-level rows (blocks and group headers) plus one
 * nested list per group, all under ONE DndContext so a block can be dragged
 * into, out of and between groups. {@link SortableList} stays the choice for a
 * flat list - it owns its own context, so two of them can never exchange rows.
 *
 * Nesting is one level: a group row reorders among its siblings and never
 * enters another group. Rows inside a group that the consumer marks fixed are
 * not rendered here at all; a hardware group is one draggable block, so it
 * moves whole.
 */
export interface GroupedSortableListProps {
  arrangement: Arrangement;
  /** Receives the whole new arrangement after a drop. */
  onArrange: (next: Arrangement) => void;
  renderBlock: (id: string, args: SortableRowArgs) => ReactNode;
  /** Renders the group shell; `children` is its nested list. `isDropTarget` is
   *  true while a drag would land inside this group, so the shell can say so. */
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

function Row({ id, render, quietPlaceholder, frozen }: {
  id: string;
  render: (id: string, args: SortableRowArgs) => ReactNode;
  /** The drop is heading into a group, so this row's own gap draws nothing. */
  quietPlaceholder?: boolean;
  /** Hold the row still: the drop is going INTO a group, so previewing a
   *  top-level reorder would slide the destination out from under the pointer. */
  frozen?: boolean;
}) {
  const { setNodeRef, transform, transition, attributes, listeners, isDragging } = useSortable({ id });
  const style: CSSProperties = frozen
    ? {}
    : { transform: CSS.Transform.toString(transform), transition };
  return <>{render(id, {
    ref: setNodeRef,
    style,
    attributes: attributes as unknown as Record<string, unknown>,
    listeners: listeners as unknown as Record<string, unknown> | undefined,
    isDragging,
    placeholderClassName: quietPlaceholder ? styles.placeholderQuiet : styles.placeholder,
  })}</>;
}

/**
 * A group's body: its own sortable context plus a droppable, so a group takes a
 * card whether or not it already holds one. The blank slot appears ONLY while
 * this group is the drop target - reserving one for every group up front shifted
 * the whole rail the moment a drag began.
 */
function GroupBody({ groupId, members, renderBlock, isDropTarget, quiet }: {
  groupId: string;
  members: string[];
  renderBlock: GroupedSortableListProps['renderBlock'];
  isDropTarget: boolean;
  quiet: boolean;
}) {
  const { setNodeRef } = useDroppable({ id: bodyDroppableId(groupId) });
  return (
    <SortableContext items={members} strategy={verticalListSortingStrategy}>
      <div ref={setNodeRef} className={styles.list} role="list">
        {members.map(id => <Row key={id} id={id} render={renderBlock} quietPlaceholder={quiet} />)}
        {isDropTarget && <div className={styles.groupDropSlot} aria-hidden />}
      </div>
    </SortableContext>
  );
}

export function GroupedSortableList({
  arrangement, onArrange, renderBlock, renderGroup, className, ariaLabel,
}: GroupedSortableListProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  // The group a drop would land in right now, so its shell can highlight.
  const [dropGroupId, setDropGroupId] = useState<string | null>(null);
  // Height of the row being dragged, so the landing slot is the same size as
  // the gap it left behind rather than an arbitrary bar.
  const [activeHeight, setActiveHeight] = useState<number | null>(null);
  // Rows do NOT move between containers mid-drag. Transferring on every
  // dragOver resizes the container the row left, which re-measures, flips the
  // target back, and oscillates until React gives up (#185, "maximum update
  // depth"). The destination ring is what tells the user where the drop lands.
  const live = arrangement;

  const collisionDetection: CollisionDetection = args => {
    const within = pointerWithin(args);
    return within.length > 0 ? within : closestCenter(args);
  };

  const sensors = useSensors(
    useSensor(GuardedPointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragOver = (e: DragOverEvent) => {
    const { active, over } = e;
    if (!over) { setDropGroupId(null); return; }
    const activeIsGroup = String(active.id) in live.groupMembers;
    const target = dropContainer(live, String(over.id));
    setDropGroupId(!activeIsGroup && target !== null && target !== ROOT ? target : null);
  };

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    const next = over ? moveTo(live, String(active.id), String(over.id)) : live;
    setActiveId(null);
    setDropGroupId(null);
    setActiveHeight(null);
    if (!sameArrangement(live, next)) onArrange(next);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      modifiers={[restrictToVerticalAxis]}
      // Measured once when the drag starts, NOT continuously: opening the
      // landing slot changes the group's height, and re-measuring on that made
      // the target flip straight back off the group.
      measuring={{ droppable: { strategy: MeasuringStrategy.WhileDragging } }}
      onDragStart={(e: DragStartEvent) => {
        setActiveId(String(e.active.id));
        setActiveHeight(e.active.rect.current.initial?.height ?? null);
      }}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={() => { setActiveId(null); setDropGroupId(null); setActiveHeight(null); }}
    >
      <SortableContext items={live.rowIds} strategy={verticalListSortingStrategy}>
        <div
          className={className ? `${styles.list} ${className}` : styles.list}
          style={activeHeight != null ? ({ ['--drop-slot-height']: `${activeHeight}px` } as CSSProperties) : undefined}
          aria-label={ariaLabel}
          role="list"
        >
          {live.rowIds.map(id => id in live.groupMembers
            ? (
              <Row key={id} id={id} frozen={dropGroupId !== null} render={(rowId, args) => renderGroup(
                rowId,
                args,
                <GroupBody
                  groupId={rowId}
                  members={live.groupMembers[rowId] ?? []}
                  renderBlock={renderBlock}
                  isDropTarget={dropGroupId === rowId}
                  quiet={dropGroupId !== null}
                />,
                dropGroupId === rowId,
              )} />
            )
            : <Row
                key={id}
                id={id}
                render={renderBlock}
                quietPlaceholder={dropGroupId !== null}
                frozen={dropGroupId !== null}
              />)}
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
