import { useState, type CSSProperties, type ReactNode } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MeasuringStrategy,
  PointerSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
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
  /** Groups showing no body. Their header stands in as the drop target, since
   *  there is nothing else to aim at. */
  collapsedGroupIds?: readonly string[];
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
  const style: CSSProperties = { transform: CSS.Transform.toString(transform), transition };
  return <>{render(id, {
    ref: setNodeRef,
    style,
    attributes: attributes as unknown as Record<string, unknown>,
    listeners: listeners as unknown as Record<string, unknown> | undefined,
    isDragging,
    placeholderClassName: styles.placeholder,
  })}</>;
}

/** A group's body: its own sortable context plus a droppable so an empty group still takes a card. */
function GroupBody({ groupId, members, renderBlock, dragging }: {
  groupId: string;
  members: string[];
  renderBlock: GroupedSortableListProps['renderBlock'];
  /** A drag is in flight, so an empty body opens up as a real drop target. */
  dragging: boolean;
}) {
  const { setNodeRef } = useDroppable({ id: bodyDroppableId(groupId) });
  const empty = members.length === 0;
  return (
    <SortableContext items={members} strategy={verticalListSortingStrategy}>
      <div
        ref={setNodeRef}
        className={`${styles.list} ${empty ? styles.groupBodyEmpty : ''}`.trim()}
        data-dragging={empty && dragging ? 'true' : undefined}
        role="list"
      >
        {members.map(id => <Row key={id} id={id} render={renderBlock} />)}
      </div>
    </SortableContext>
  );
}

export function GroupedSortableList({
  arrangement, onArrange, renderBlock, renderGroup, collapsedGroupIds = [], className, ariaLabel,
}: GroupedSortableListProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  // The group a drop would land in right now, so its shell can highlight.
  const [dropGroupId, setDropGroupId] = useState<string | null>(null);
  // Rows do NOT move between containers mid-drag. Transferring on every
  // dragOver resizes the container the row left, which re-measures, flips the
  // target back, and oscillates until React gives up (#185, "maximum update
  // depth"). The destination ring is what tells the user where the drop lands.
  const live = arrangement;

  const sensors = useSensors(
    useSensor(GuardedPointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragOver = (e: DragOverEvent) => {
    const { active, over } = e;
    if (!over) { setDropGroupId(null); return; }
    const activeIsGroup = String(active.id) in live.groupMembers;
    const target = dropContainer(live, String(over.id), collapsedGroupIds);
    setDropGroupId(!activeIsGroup && target !== null && target !== ROOT ? target : null);
  };

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    const next = over ? moveTo(live, String(active.id), String(over.id), collapsedGroupIds) : live;
    setActiveId(null);
    setDropGroupId(null);
    if (!sameArrangement(live, next)) onArrange(next);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis]}
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      onDragStart={(e: DragStartEvent) => setActiveId(String(e.active.id))}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={() => { setActiveId(null); setDropGroupId(null); }}
    >
      <SortableContext items={live.rowIds} strategy={verticalListSortingStrategy}>
        <div className={className ? `${styles.list} ${className}` : styles.list} aria-label={ariaLabel} role="list">
          {live.rowIds.map(id => id in live.groupMembers
            ? (
              <Row key={id} id={id} render={(rowId, args) => renderGroup(
                rowId,
                args,
                <GroupBody
                  groupId={rowId}
                  members={live.groupMembers[rowId] ?? []}
                  renderBlock={renderBlock}
                  dragging={activeId !== null}
                />,
                dropGroupId === rowId,
              )} />
            )
            : <Row key={id} id={id} render={renderBlock} />)}
        </div>
      </SortableContext>
      <DragOverlay dropAnimation={null}>
        {activeId !== null && (
          <div className={styles.overlay}>
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
