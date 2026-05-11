import type { ReactNode } from 'react';
import { EmptyState } from '../../../components/EmptyState/EmptyState';
import styles from './PanelWidgetChrome.module.scss';

type StatusTone = 'online' | 'away' | 'busy' | 'offline';

export function PanelWidgetShell({
  size,
  className,
  children,
}: {
  size: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`${styles.widget} ${className ?? ''}`} data-size={size}>
      {children}
    </div>
  );
}

export function PanelWidgetTabs({
  ariaLabel,
  compact = false,
  children,
}: {
  ariaLabel: string;
  compact?: boolean;
  children: ReactNode;
}) {
  return (
    <nav className={styles.tabs} data-compact={compact ? 'true' : 'false'} aria-label={ariaLabel}>
      {children}
    </nav>
  );
}

export function PanelWidgetTab({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button type="button" className={styles.tab} data-active={active ? 'true' : 'false'} onClick={onClick}>
      {icon}
      <span className={styles.tabLabel}>{label}</span>
    </button>
  );
}

export function PanelWidgetSetup({
  icon,
  title,
  message,
  actions,
}: {
  icon: ReactNode;
  title?: string;
  message: string;
  actions?: ReactNode;
}) {
  return (
    <div className={styles.setup}>
      {icon}
      {title ? <div className={styles.setupTitle}>{title}</div> : null}
      <div className={styles.setupMessage}>{message}</div>
      {actions}
    </div>
  );
}

export function PanelWidgetEmpty({
  icon,
  title,
  text,
}: {
  icon: ReactNode;
  title: string;
  text?: string;
}) {
  return <EmptyState compact icon={icon} title={title} hint={text} />;
}

export function PanelStatusDot({ tone }: { tone: StatusTone }) {
  return <span className={`${styles.statusDot} ${styles[tone]}`} />;
}
