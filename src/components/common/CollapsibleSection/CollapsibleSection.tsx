import { useImperativeHandle, type ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { type SortableRowArgs } from '../SortableList/SortableList';
import { DEVICE_NAME_MAX_LENGTH, type EditableTextHandle } from '../Editable/EditableText';
import { useEditable } from '../Editable/useEditable';
import editableStyles from '../Editable/Editable.module.scss';
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
  titleBefore,
  titleAfter,
  open,
  onToggle,
  right,
  rightInteractive,
  compact,
  boxed,
  className,
  ariaLabel,
  sectionId,
  drag,
  onTitleRename,
  titleRenameRef,
  onHeaderContextMenu,
  children,
}: {
  title: ReactNode;
  /** Node rendered between the chevron and the title (a device glyph). Must
   *  not contain interactive elements - it nests in the toggle button. */
  titleBefore?: ReactNode;
  /** Node rendered immediately after the title text, inside the toggle. Sits
   *  outside the title's ellipsis so a trailing badge/icon stays visible when
   *  the title truncates. Must not contain interactive elements - it nests in
   *  the toggle button. */
  titleAfter?: ReactNode;
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
  /** Wraps the section in the standard app box (surface fill, transparent
   *  border, radius) instead of the bare header + list. Header and body share
   *  the box's own padding as their one inset, so their content lines up on
   *  a single left edge. Use for a standalone full-width section (e.g.
   *  monitoring Detailed); leave unset for a group nested in an already
   *  boxed/carded parent. */
  boxed?: boolean;
  className?: string;
  ariaLabel?: string;
  /** Sets `data-section-id` on the root (scroll/lookup targeting). */
  sectionId?: string;
  /** When set, the whole section becomes reorderable among its siblings via
   *  dnd-kit. The header bar is the drag handle, minus the title and any
   *  interactive `right` control. */
  drag?: SortableRowArgs;
  /** Lets the section's own menu rename the title, through `titleRenameRef`.
   *  Requires a string `title`; the title then leaves the toggle button (a
   *  text field cannot nest in one), so the chevron, the bar's empty run and
   *  the title itself each toggle the section. */
  onTitleRename?: (name: string) => void;
  /** Opens the title editor, for a Rename row in the section's own menu. */
  titleRenameRef?: React.Ref<EditableTextHandle>;
  /** Right-click on the header bar, for sections that carry their own menu. Not
   *  fired from inside the title editor, which keeps the browser's own menu. */
  onHeaderContextMenu?: (e: React.MouseEvent) => void;
  children: ReactNode;
}) {
  const Chevron = open ? ChevronDown : ChevronRight;
  const editableTitle = onTitleRename !== undefined && typeof title === 'string';
  // The rename state lives here so the resting title is one plain element and
  // the editor exists only while a rename is open.
  const rename = useEditable<string>({
    value: editableTitle ? title : '',
    onCommit: name => onTitleRename?.(name),
    parse: draft => {
      const trimmed = draft.trim().slice(0, DEVICE_NAME_MAX_LENGTH);
      return trimmed ? trimmed : null;
    },
  });
  useImperativeHandle(titleRenameRef, () => ({ startEditing: () => rename.start() }));

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
      data-boxed={boxed ? 'true' : undefined}
    >
      <div
        className={styles.header}
        data-compact={compact ? 'true' : undefined}
        data-collapsed={open ? undefined : 'true'}
        onContextMenu={onHeaderContextMenu && (e => {
          if ((e.target as HTMLElement).closest('input, textarea, [contenteditable]')) return;
          onHeaderContextMenu(e);
        })}
      >
        {/* The toggle (chevron + title + any non-interactive `right` content) is
            the drag handle; an interactive `right` control sits outside it so a
            press-drag on a power switch never starts a group reorder. With an
            editable title the bar's empty run carries the listeners too, or the
            chevron would be the only spot a group could be dragged by. */}
        {editableTitle ? (
          <>
            <button
              type="button"
              className={styles.toggleChevron}
              data-drag-handle={drag ? 'true' : undefined}
              aria-expanded={open}
              aria-label={ariaLabel}
              onClick={onToggle}
              {...(drag?.listeners ?? {})}
            >
              <Chevron className={styles.chevron} aria-hidden />
              {titleBefore}
            </button>
            {rename.editing ? (
              <input
                className={`${editableStyles.input} ${styles.title}`}
                maxLength={DEVICE_NAME_MAX_LENGTH}
                aria-label={ariaLabel}
                {...rename.inputProps}
              />
            ) : (
              /* The strip between the chevron and the fill toggles like the
                 rest of the bar, so it is not dead and shows the hand. */
              <span className={`${styles.title} ${styles.titleSlot}`} onClick={onToggle}>{title}</span>
            )}
            {titleAfter}
            {/* Keeps the bar's empty run a toggle target now that the title owns
                its own clicks. Hidden from a11y: the chevron is the control. */}
            <button
              type="button"
              className={styles.toggleFill}
              data-drag-handle={drag ? 'true' : undefined}
              tabIndex={-1}
              aria-hidden="true"
              onClick={onToggle}
              {...(drag?.listeners ?? {})}
            />
            {right !== undefined && <div className={styles.right}>{right}</div>}
          </>
        ) : (
          <>
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
              {titleBefore}
              <span className={styles.title}>{title}</span>
              {titleAfter}
              {right !== undefined && !rightInteractive && <span className={styles.right}>{right}</span>}
            </button>
            {right !== undefined && rightInteractive && <div className={styles.right}>{right}</div>}
          </>
        )}
      </div>
      {open && <div className={styles.body}>{children}</div>}
    </div>
  );
}

export default CollapsibleSection;
