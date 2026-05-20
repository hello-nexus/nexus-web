import type { ReactNode } from 'react';
import styles from './Card.module.scss';

/*
 * Generic card surface. Compose in for a consistent background, border,
 * radius, and padding across every card-shaped panel in the app. Pass
 * `title`/`subtitle`/`actions` for the standard header, or omit them and
 * render a fully custom header inside `children`.
 *
 * `interactive` adds a hover state (border + bg lift) for cards that act as
 * buttons or selection targets.
 */
export interface CardProps {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  interactive?: boolean;
  className?: string;
  onClick?: () => void;
}

export function Card({ title, subtitle, actions, children, interactive, className, onClick }: CardProps) {
  const hasHeader = title !== undefined || subtitle !== undefined || actions !== undefined;
  return (
    <div className={`${styles.root} ${interactive || onClick ? styles.interactive : ''} ${className ?? ''}`} onClick={onClick}>
      {hasHeader && (
        <div className={styles.header}>
          <div className={styles.titleCol}>
            {title !== undefined && <h4 className={styles.title}>{title}</h4>}
            {subtitle !== undefined && <span className={styles.subtitle}>{subtitle}</span>}
          </div>
          {actions !== undefined && <div className={styles.actions}>{actions}</div>}
        </div>
      )}
      {children !== undefined && <div className={styles.body}>{children}</div>}
    </div>
  );
}
