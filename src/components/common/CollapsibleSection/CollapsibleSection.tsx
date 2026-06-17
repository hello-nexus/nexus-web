import { useRef, type ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import styles from './CollapsibleSection.module.scss';

/** HTML5 drag/drop wiring for a reorderable group, shared by the cooling and
 *  lighting device-group lists. Same shape as the per-card drag handles so a
 *  whole category reorders the same way a single card does. The header is the
 *  drag handle; the body (its child cards, which carry their own drag) is
 *  excluded so grabbing a card never starts a group drag. */
export interface CollapsibleSectionDrag {
  isDragging: boolean;
  isDragOver: boolean;
  onDragStart: () => void;
  onDragOver: () => void;
  onDragLeave: () => void;
  onDrop: () => void;
  onDragEnd: () => void;
}

/**
 * Canonical collapsible section header: a chevron + title on the left,
 * optional values/buttons on the right, a hover background bar, and no
 * borders. The one treatment every collapsible group uses (paired smart
 * lights, monitoring detail, lighting/cooling device groups) so they read
 * identically. `compact` shrinks the header to the smaller uppercase font the
 * lighting/cooling device groups use.
 *
 * The whole header toggles: non-interactive `right` content (a count, a
 * subtitle) rides inside the toggle button so the entire bar is one click
 * target. Pass `rightInteractive` when `right` holds its own control (e.g. a
 * power switch) so it sits outside the toggle and clicking it doesn't collapse
 * the section.
 */
export function CollapsibleSection({
  title,
  open,
  onToggle,
  right,
  rightInteractive,
  compact,
  className,
  ariaLabel,
  sectionId,
  drag,
  children,
}: {
  title: ReactNode;
  open: boolean;
  onToggle: () => void;
  /** Values or a control shown on the right of the header. Rides inside the
   *  toggle (whole bar clickable) unless `rightInteractive` is set. */
  right?: ReactNode;
  /** Set when `right` is its own interactive control (e.g. a power switch):
   *  it then sits outside the toggle so clicking it doesn't collapse the
   *  section, and a button never nests inside the toggle button. */
  rightInteractive?: boolean;
  /** Smaller uppercase header (lighting / cooling device groups). */
  compact?: boolean;
  className?: string;
  ariaLabel?: string;
  /** Sets `data-section-id` on the root (scroll/lookup targeting). */
  sectionId?: string;
  /** When set, the whole section becomes draggable to reorder it among its
   *  siblings. The header is the drag handle; child cards keep their own drag. */
  drag?: CollapsibleSectionDrag;
  children: ReactNode;
}) {
  const Chevron = open ? ChevronDown : ChevronRight;
  const rootRef = useRef<HTMLDivElement>(null);
  // Only a grab that starts on the header (not the body / a child card) makes
  // the section the drag source; mirrors the per-card draggable gating.
  const fromHeader = (target: EventTarget | null) =>
    target instanceof HTMLElement && !!target.closest('[data-drag-handle]');

  const classNames = [
    styles.section,
    className ?? '',
    drag?.isDragging ? styles.dragging : '',
    drag?.isDragOver ? styles.dragOver : '',
  ].filter(Boolean).join(' ');

  return (
    <div
      ref={rootRef}
      className={classNames}
      data-section-id={sectionId}
      draggable={!!drag}
      onMouseDownCapture={drag ? (e) => {
        if (rootRef.current) rootRef.current.draggable = fromHeader(e.target);
      } : undefined}
      onDragStart={drag ? (e) => {
        // A bubbled child-card drag (grabbed in the body) must pass through
        // untouched; only a header grab starts the group drag.
        if (!fromHeader(e.target)) return;
        e.stopPropagation();
        drag.onDragStart();
      } : undefined}
      onDragOver={drag ? (e) => { e.preventDefault(); drag.onDragOver(); } : undefined}
      onDragLeave={drag ? drag.onDragLeave : undefined}
      onDrop={drag ? drag.onDrop : undefined}
      onDragEnd={drag ? drag.onDragEnd : undefined}
    >
      <div
        className={styles.header}
        data-compact={compact ? 'true' : undefined}
        data-collapsed={open ? undefined : 'true'}
      >
        {/* The toggle (chevron + title + any non-interactive `right` content) is
            the drag handle; an interactive `right` control sits outside it so a
            press-drag on a power switch never starts a group reorder. */}
        <button
          type="button"
          className={styles.toggle}
          data-drag-handle={drag ? 'true' : undefined}
          aria-expanded={open}
          aria-label={ariaLabel}
          onClick={onToggle}
        >
          <Chevron className={styles.chevron} aria-hidden />
          <span className={styles.title}>{title}</span>
          {right !== undefined && !rightInteractive && <span className={styles.right}>{right}</span>}
        </button>
        {right !== undefined && rightInteractive && <div className={styles.right}>{right}</div>}
      </div>
      {open && <div className={styles.body}>{children}</div>}
    </div>
  );
}

export default CollapsibleSection;
