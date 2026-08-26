import { type ReactNode, type RefObject } from 'react';
import classNames from 'classnames';
import { Check, ChevronDown } from 'lucide-react';
import { Popover } from '../Popover/Popover';
import styles from './ModeMenu.module.scss';

export interface ModeMenuEntry {
  readonly key: string;
  /** Glyph shown at the row's head; the same one the trigger wears once picked. */
  readonly icon: ReactNode;
  readonly title: string;
  /** One line under the title saying what the choice does to the page. */
  readonly description: string;
  readonly active?: boolean;
  /** Receives the row that was pressed, so a caller can anchor an effect on it. */
  readonly onSelect: (origin: HTMLButtonElement) => void;
}

export interface ModeMenuProps {
  open: boolean;
  onClose: () => void;
  /** Wrapper around the trigger; a click inside it never dismisses. */
  anchorRef: RefObject<HTMLElement | null>;
  entries: readonly ModeMenuEntry[];
  ariaLabel: string;
}

/** Tab key the mode menu hangs off; not a page mode, so it never reaches the service. */
export const MODE_MENU_TAB_KEY = 'modeMenu';

/**
 * The lighting / cooling page-mode menu: Off plus the simple/advanced swap,
 * each a large row carrying a glyph, a title and one line of explanation.
 * Anchored under the mode tab that opens it (see {@link ModeMenuTriggerLabel}),
 * which is why the caller owns the anchor element and the open state.
 */
export function ModeMenu({ open, onClose, anchorRef, entries, ariaLabel }: ModeMenuProps) {
  return (
    <Popover
      open={open}
      onClose={onClose}
      anchorRef={anchorRef}
      placement="bottom-start"
      role="menu"
      ariaLabel={ariaLabel}
      className={styles.menu}
    >
      {entries.map(entry => (
        <button
          key={entry.key}
          type="button"
          role="menuitemradio"
          aria-checked={!!entry.active}
          className={classNames(styles.entry, entry.active && styles.entryActive)}
          onClick={e => { const origin = e.currentTarget; onClose(); entry.onSelect(origin); }}
        >
          <span className={styles.entryIcon} aria-hidden>{entry.icon}</span>
          <span className={styles.entryText}>
            <span className={styles.entryTitle}>{entry.title}</span>
            <span className={styles.entryDescription}>{entry.description}</span>
          </span>
          {entry.active && <Check className={styles.entryCheck} size={16} aria-hidden />}
        </button>
      ))}
    </Popover>
  );
}

/**
 * Label for the tab that opens a {@link ModeMenu}: the current choice's name
 * plus a caret, so the tab reads as a menu rather than a plain tab. The
 * matching glyph rides the tab's own icon slot.
 */
export function ModeMenuTriggerLabel({ label }: { label: string }) {
  return (
    <span className={styles.trigger}>
      {label}
      <ChevronDown className={styles.triggerCaret} size={12} aria-hidden />
    </span>
  );
}
