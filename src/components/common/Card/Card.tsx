import type { ReactNode } from 'react';
import styles from './Card.module.scss';

/*
 * Generic card surface. Compose in for a consistent background, border,
 * radius, and padding across every card-shaped panel in the app. Pass
 * `title`/`subtitle`/`actions` for the standard header, or omit them and
 * render a fully custom header inside `children`.
 *
 * `interactive` adds a hover state (border + bg lift) for cards that act as
 * buttons or selection targets. `compact` tightens padding for dense layouts
 * such as tile grids.
 */
export interface CardProps {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  interactive?: boolean;
  compact?: boolean;
  className?: string;
  onClick?: () => void;
  // Truncates a long subtitle to one line with an ellipsis. Off by default -
  // most callers pass sentence-length subtitles meant to wrap.
  truncateSubtitle?: boolean;
  // Skips the button role/tabIndex/keydown handling `onClick` otherwise adds.
  // Set this when `children` already renders its own focusable control -
  // role="button" would nest a focusable descendant inside a button role,
  // which is invalid ARIA. The card stays mouse-clickable either way.
  disableInteractiveRole?: boolean;
}

export function Card({
  title, subtitle, actions, children, interactive, compact, className, onClick, truncateSubtitle, disableInteractiveRole,
}: CardProps) {
  const hasHeader = title !== undefined || subtitle !== undefined || actions !== undefined;
  const interactiveRole = onClick && !disableInteractiveRole;
  return (
    <div
      className={`${styles.root} ${interactive || onClick ? styles.interactive : ''} ${compact ? styles.compact : ''} ${className ?? ''}`}
      onClick={onClick}
      role={interactiveRole ? 'button' : undefined}
      tabIndex={interactiveRole ? 0 : undefined}
      onKeyDown={interactiveRole ? (e) => {
        // Only react to a keypress on the card itself - a nested interactive
        // child (e.g. a toggle button) handles its own Enter/Space and must
        // not also trigger the card's onClick via bubbling.
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      } : undefined}
    >
      {hasHeader && (
        <div className={styles.header}>
          <div className={styles.titleCol}>
            {title !== undefined && <h4 className={styles.title}>{title}</h4>}
            {subtitle !== undefined && (
              <span className={`${styles.subtitle} ${truncateSubtitle ? styles.subtitleTruncate : ''}`}>{subtitle}</span>
            )}
          </div>
          {actions !== undefined && <div className={styles.actions}>{actions}</div>}
        </div>
      )}
      {children !== undefined && <div className={styles.body}>{children}</div>}
    </div>
  );
}
