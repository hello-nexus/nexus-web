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
  // A leading glyph rendered before the title, centered against the title
  // line. Rendered aria-hidden: purely decorative, so keep any meaning in the
  // title itself.
  icon?: ReactNode;
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
  // Swaps the interactive hover/focus treatment for the shared dash-tile
  // recipe (monitoring overview cards) instead of the default card hover.
  // Only meaningful together with `interactive` or `onClick`.
  dashHover?: boolean;
  // Fills the parent's own height (instead of the default content-sized
  // height) and lets the body scroll on its own while the header stays
  // pinned - for a card occupying a fixed-height region (e.g. an inline
  // detail sidebar) rather than flowing in a page's own scroll.
  fillHeight?: boolean;
  // ARIA role/name for the root - e.g. 'region' + a label for a card that is
  // itself a landmark, distinct from `interactive`'s role='button'.
  role?: string;
  ariaLabel?: string;
}

export function Card({
  title, subtitle, actions, icon, children, interactive, compact, className, onClick, truncateSubtitle, disableInteractiveRole, dashHover,
  fillHeight, role, ariaLabel,
}: CardProps) {
  const hasHeader = title !== undefined || subtitle !== undefined || actions !== undefined || icon !== undefined;
  const interactiveRole = onClick && !disableInteractiveRole;
  const isInteractive = interactive || Boolean(onClick);
  const interactiveClass = isInteractive ? (dashHover ? styles.dashHover : styles.interactive) : '';
  return (
    <div
      className={`${styles.root} ${interactiveClass} ${compact ? styles.compact : ''} ${fillHeight ? styles.fillHeight : ''} ${className ?? ''}`}
      onClick={onClick}
      role={interactiveRole ? 'button' : role}
      aria-label={ariaLabel}
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
          <div className={styles.headerMain}>
            {icon !== undefined && <span className={styles.icon} aria-hidden="true">{icon}</span>}
            <div className={styles.titleCol}>
              {title !== undefined && <h4 className={styles.title}>{title}</h4>}
              {subtitle !== undefined && (
                <span className={`${styles.subtitle} ${truncateSubtitle ? styles.subtitleTruncate : ''}`}>{subtitle}</span>
              )}
            </div>
          </div>
          {actions !== undefined && <div className={styles.actions}>{actions}</div>}
        </div>
      )}
      {children !== undefined && <div className={styles.body}>{children}</div>}
    </div>
  );
}
