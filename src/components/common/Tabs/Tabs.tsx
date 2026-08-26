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
  /** Accessible name for a tab whose label carries no text (icon-only). */
  readonly ariaLabel?: string;
  /** Wraps the tab's content in the sidebar section-header pill (Apps /
   *  Devices), marking it as a control rather than one more page tab. */
  readonly chip?: boolean;
  /** Marks the tab as a menu trigger and carries the menu's open state, so a
   *  tab that drops a popup announces itself as one (the lighting / cooling
   *  mode tab). Omit for a plain tab. */
  readonly expanded?: boolean;
  /** Optional trailing control, right-aligned after the label (e.g. a per-tab
   *  pause toggle). Rendered as a DOM sibling of the tab's own `<button>`,
   *  inside a shared visual pill - never a descendant of it. A focusable
   *  control nested inside a `<button>` is invalid ARIA (buttons are leaf
   *  controls; assistive tech won't expose a descendant as separately
   *  reachable) on top of forbidding literal `<button>`-in-`<button>` HTML -
   *  see Card's `disableInteractiveRole` for the same constraint elsewhere.
   *  A click/keydown on it is stopped from bubbling into the tab's onChange. */
  readonly trailing?: ReactNode;
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
      {tabs.map(tab => {
        const isActive = tab.key === activeKey;
        // No trailing control: the button alone is the flex item, byte-for-byte
        // the same markup every existing caller already renders.
        if (!tab.trailing) {
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-label={tab.ariaLabel}
              aria-haspopup={tab.expanded === undefined ? undefined : 'menu'}
              aria-expanded={tab.expanded}
              className={classNames(styles.tab, { [styles.active]: isActive })}
              disabled={disabled || tab.disabled}
              onClick={e => onChange(tab.key, e.currentTarget)}
            >
              <span className={classNames(styles.tabInner, { [styles.tabChip]: tab.chip })}>
                {tab.icon && <span className={styles.tabIcon} aria-hidden="true">{tab.icon}</span>}
                <span className={styles.tabLabel}>{tab.label}</span>
              </span>
            </button>
          );
        }
        // With a trailing control, the tab becomes a flex-item group: the
        // button and the trailing control are siblings sharing one pill, not
        // parent/child, so the trailing control stays a separately reachable
        // focus target instead of a descendant of the tab's own button.
        return (
          <span key={tab.key} role="presentation" className={classNames(styles.tabGroup, { [styles.active]: isActive })}>
            <button
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-label={tab.ariaLabel}
              aria-haspopup={tab.expanded === undefined ? undefined : 'menu'}
              aria-expanded={tab.expanded}
              className={styles.tab}
              disabled={disabled || tab.disabled}
              onClick={e => onChange(tab.key, e.currentTarget)}
            >
              <span className={classNames(styles.tabInner, { [styles.tabChip]: tab.chip })}>
                {tab.icon && <span className={styles.tabIcon} aria-hidden="true">{tab.icon}</span>}
                <span className={styles.tabLabel}>{tab.label}</span>
              </span>
            </button>
            <span className={styles.tabTrailing}>
              {tab.trailing}
            </span>
          </span>
        );
      })}
    </nav>
  );
}
