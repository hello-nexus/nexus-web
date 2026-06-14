import type { ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import styles from './CollapsibleSection.module.scss';

/**
 * Canonical collapsible section header: a chevron + title on the left,
 * optional values/buttons on the right, a hover background bar, and no
 * borders. The one treatment every collapsible group uses (paired smart
 * lights, monitoring detail, lighting/cooling device groups) so they read
 * identically. `compact` shrinks the header to the smaller uppercase font the
 * lighting/cooling device groups use.
 */
export function CollapsibleSection({
  title,
  open,
  onToggle,
  right,
  compact,
  className,
  ariaLabel,
  sectionId,
  children,
}: {
  title: ReactNode;
  open: boolean;
  onToggle: () => void;
  /** Values or buttons shown on the right of the header. */
  right?: ReactNode;
  /** Smaller uppercase header (lighting / cooling device groups). */
  compact?: boolean;
  className?: string;
  ariaLabel?: string;
  /** Sets `data-section-id` on the root (scroll/lookup targeting). */
  sectionId?: string;
  children: ReactNode;
}) {
  const Chevron = open ? ChevronDown : ChevronRight;
  return (
    <div
      className={className ? `${styles.section} ${className}` : styles.section}
      data-section-id={sectionId}
    >
      <div
        className={styles.header}
        data-compact={compact ? 'true' : undefined}
        data-collapsed={open ? undefined : 'true'}
      >
        <button
          type="button"
          className={styles.toggle}
          aria-expanded={open}
          aria-label={ariaLabel}
          onClick={onToggle}
        >
          <Chevron className={styles.chevron} aria-hidden />
          <span className={styles.title}>{title}</span>
        </button>
        {right !== undefined && <div className={styles.right}>{right}</div>}
      </div>
      {open && <div className={styles.body}>{children}</div>}
    </div>
  );
}

export default CollapsibleSection;
