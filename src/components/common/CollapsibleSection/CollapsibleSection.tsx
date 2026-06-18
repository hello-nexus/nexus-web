import { type ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { type SortableRowArgs } from '../SortableList/SortableList';
import styles from './CollapsibleSection.module.scss';

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
  /** When set, the whole section becomes reorderable among its siblings via
   *  dnd-kit. The toggle button is the drag handle. */
  drag?: SortableRowArgs;
  children: ReactNode;
}) {
  const Chevron = open ? ChevronDown : ChevronRight;

  const classNames = [
    styles.section,
    className ?? '',
    drag?.isDragging ? drag.placeholderClassName : '',
  ].filter(Boolean).join(' ');

  return (
    <div
      ref={drag?.ref ?? (() => {})}
      style={drag?.style ?? {}}
      {...(drag?.attributes ?? {})}
      className={classNames}
      data-section-id={sectionId}
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
          {...(drag?.listeners ?? {})}
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
