import type { ReactNode } from 'react';
import classNames from 'classnames';
import styles from './Tabs.module.scss';

export interface TabDef {
  readonly key: string;
  /** Text or arbitrary node. Accepting ReactNode lets callers inline a badge
   *  / indicator (like the Effect-tab dot in Lighting) without forcing every
   *  consumer to add its own className plumbing. */
  readonly label: ReactNode;
  /** Optional leading icon rendered with the same spacing across every tab bar. */
  readonly icon?: ReactNode;
  /** Per-tab disable. Takes precedence over the `disabled` root flag. */
  readonly disabled?: boolean;
}

export interface TabsProps {
  tabs: readonly TabDef[];
  activeKey: string;
  onChange: (key: string, origin: HTMLButtonElement) => void;
  /** Disables every tab. Use TabDef.disabled for a single tab. */
  disabled?: boolean;
  /** aria-label for the <nav> element. Defaults to "Tabs" if omitted. */
  ariaLabel?: string;
  /** Optional extra class on the <nav>, e.g. for tighter margins in constrained layouts. */
  className?: string;
  /** Stretch the bar to 100% width with each tab sharing the width equally. */
  fullWidth?: boolean;
}

/**
 * Horizontal tab bar - the canonical tab affordance across the app. A bordered
 * segmented group with a solid accent fill on the active tab; inactive tabs are
 * neutral-dim and hover to plain text. Text-only and icon+text tabs both flow
 * through this one component.
 */
export function Tabs({ tabs, activeKey, onChange, disabled, ariaLabel = 'Tabs', className, fullWidth = false }: TabsProps) {
  const navClass = classNames(styles.tabs, fullWidth && styles.fullWidth, className);
  return (
    <nav className={navClass} role="tablist" aria-label={ariaLabel}>
      {tabs.map(tab => (
        <button
          key={tab.key}
          type="button"
          role="tab"
          aria-selected={tab.key === activeKey}
          className={classNames(styles.tab, { [styles.active]: tab.key === activeKey })}
          disabled={disabled || tab.disabled}
          onClick={e => onChange(tab.key, e.currentTarget)}
        >
          <span className={styles.tabInner}>
            {tab.icon && <span className={styles.tabIcon} aria-hidden="true">{tab.icon}</span>}
            <span className={styles.tabLabel}>{tab.label}</span>
          </span>
        </button>
      ))}
    </nav>
  );
}
