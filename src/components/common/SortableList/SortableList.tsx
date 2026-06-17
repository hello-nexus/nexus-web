import { useRef, useState, type CSSProperties, type ReactNode } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MeasuringStrategy,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { spawnDropRing } from '../../../lib/dropRing';
import styles from './SortableList.module.scss';

/**
 * Shared vertical drag-to-reorder list, built on @dnd-kit (the same engine the
 * panel-widget rearrange uses) so every 1D reorder surface gets the same feel:
 * the dragged row turns into a dotted placeholder that slides to the drop slot,
 * siblings animate out of the way, and a floating clone tracks the cursor.
 *
 * Consumers render each row via `renderRow`, spreading the supplied args onto
 * the row's root (or, for a drag-handle row like a category header, putting
 * `listeners` on the handle and adding `data-drag-handle`). Mark interactive
 * children that must NOT start a drag with `data-no-dnd` (buttons, switches,
 * the name editor) - the sensor ignores pointer-downs inside them, so the row
 * stays whole-row draggable without hijacking taps.
 */

export interface SortableRowArgs {
  /** Ref for the row's root element. */
  ref: (el: HTMLElement | null) => void;
  /** transform + transition (the shift animation); spread onto the root. */
  style: CSSProperties;
  /** a11y attributes; spread onto the root. */
  attributes: Record<string, unknown>;
  /** Drag activators; spread onto the root (whole-row) or a handle element. */
  listeners: Record<string, unknown> | undefined;
  /** True on the row being dragged - add `placeholderClassName` to show the
   *  dotted drop slot in its place. */
  isDragging: boolean;
  /** Class that turns the row into the dashed drop-slot placeholder. */
  placeholderClassName: string;
}

interface SortableListProps {
  /** Ordered row ids; the source of truth for order. */
  ids: string[];
  /** Receives the new id order after a drop. */
  onReorder: (ids: string[]) => void;
  /** Render one row given its id and the drag wiring. */
  renderRow: (id: string, args: SortableRowArgs) => ReactNode;
  /** Render the floating clone for the dragged id (defaults to the row). */
  renderOverlay?: (id: string) => ReactNode;
  className?: string;
  ariaLabel?: string;
}

// Pointer drags ignore presses that start inside a `[data-no-dnd]` subtree so
// buttons / switches / inline editors keep their own gestures. A 6px distance
// constraint lets a plain click through before a drag ever begins.
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

function SortableRow({ id, renderRow, registerNode }: {
  id: string;
  renderRow: SortableListProps['renderRow'];
  registerNode: (id: string, el: HTMLElement | null) => void;
}) {
  const { setNodeRef, transform, transition, attributes, listeners, isDragging } = useSortable({ id });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  return (
    <>
      {renderRow(id, {
        ref: (el) => { setNodeRef(el); registerNode(id, el); },
        style,
        attributes: attributes as unknown as Record<string, unknown>,
        listeners: listeners as unknown as Record<string, unknown> | undefined,
        isDragging,
        placeholderClassName: styles.placeholder,
      })}
    </>
  );
}

export function SortableList({ ids, onReorder, renderRow, renderOverlay, className, ariaLabel }: SortableListProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  // Live row element refs so a drop can flash the confirm ring at the row's
  // final resting slot (read on the next frame, after the reorder re-renders).
  const nodes = useRef(new Map<string, HTMLElement | null>());
  const registerNode = (id: string, el: HTMLElement | null) => {
    if (el) nodes.current.set(id, el);
    else nodes.current.delete(id);
  };
  const sensors = useSensors(
    useSensor(GuardedPointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));
  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    const droppedId = String(active.id);
    if (active.id !== over.id) {
      const from = ids.indexOf(droppedId);
      const to = ids.indexOf(String(over.id));
      if (from !== -1 && to !== -1) onReorder(arrayMove(ids, from, to));
    }
    requestAnimationFrame(() => spawnDropRing(nodes.current.get(droppedId)));
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis]}
      // Re-measure droppables continuously so siblings reflow out of the way as
      // the drag moves (matches the panel-widget rearrange feel).
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <div className={className ? `${styles.list} ${className}` : styles.list} aria-label={ariaLabel} role="list">
          {ids.map(id => <SortableRow key={id} id={id} renderRow={renderRow} registerNode={registerNode} />)}
        </div>
      </SortableContext>
      <DragOverlay dropAnimation={null}>
        {activeId !== null && (
          <div className={styles.overlay}>
            {(renderOverlay ?? ((id: string) => renderRow(id, {
              ref: () => {}, style: {}, attributes: {}, listeners: undefined,
              isDragging: false, placeholderClassName: styles.placeholder,
            })))(activeId)}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

export default SortableList;
