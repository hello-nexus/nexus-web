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

export type TabsVariant = 'underline' | 'pill';

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
  /**
   * Visual treatment:
   * - `underline` (default): accent underline on the active tab, neutral
   *   border-bottom on the bar. Used for page-level primary nav.
   * - `pill`: bordered segmented group with accent-soft fill on the active
   *   pill. Used for secondary in-page toggles (panel theme settings, icon picker).
   */
  variant?: TabsVariant;
  /** Stretch the bar to 100% width with each tab sharing the width equally. */
  fullWidth?: boolean;
}

/**
 * Horizontal tab bar. The canonical primary-nav affordance across every
 * primary view. Active tab underlines with the accent in the default variant;
 * inactive tabs are neutral-dim and hover to plain text. The `pill` variant
 * renders a segmented toggle group instead of an underline bar - same
 * semantics, different chrome, same component.
 */
export function Tabs({ tabs, activeKey, onChange, disabled, ariaLabel = 'Tabs', className, variant = 'underline', fullWidth = false }: TabsProps) {
  const navClass = classNames(
    styles.tabs,
    variant === 'pill' && styles.tabsPill,
    fullWidth && styles.fullWidth,
    className,
  );
  const tabClass = variant === 'pill' ? styles.pillTab : styles.tab;
  const activeClass = variant === 'pill' ? styles.pillActive : styles.active;
  return (
    <nav className={navClass} role="tablist" aria-label={ariaLabel}>
      {tabs.map(tab => (
        <button
          key={tab.key}
          type="button"
          role="tab"
          aria-selected={tab.key === activeKey}
          className={classNames(tabClass, { [activeClass]: tab.key === activeKey })}
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
