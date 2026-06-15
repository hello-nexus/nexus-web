import type { ReactNode } from 'react';
import { Tabs, type TabDef } from '../Tabs/Tabs';
import styles from './ViewHeader.module.scss';

interface ViewHeaderProps {
  // Page name. No longer rendered as a heading (the top bar shows it) - kept
  // only as the accessible label for the tab strip.
  title: string;
  tabs?: readonly TabDef[];
  activeTab?: string;
  onTabChange?: (key: string) => void;
  tabsDisabled?: boolean;
  actions?: ReactNode;
  /** Right-aligned widget at the same vertical level as the tabs. Overlaid via
   *  absolute positioning so it doesn't stretch the tab bar's width. */
  tabActions?: ReactNode;
}

// Page-level tabs use the shared Tabs primitive so every tab bar in the app
// reads as one control. Text-only and icon+text tabs both flow through the
// single component.

export function ViewHeader({ title, tabs, activeTab, onTabChange, tabsDisabled, actions, tabActions }: ViewHeaderProps) {
  return (
    <header className={styles.header}>
      {actions && (
        <div className={styles.titleRow}>
          <div className={styles.actions}>{actions}</div>
        </div>
      )}
      {tabs && tabs.length > 0 && (
        <div className={styles.tabsRow}>
          <Tabs
            tabs={tabs}
            activeKey={activeTab ?? ''}
            onChange={k => onTabChange?.(k)}
            disabled={tabsDisabled}
            className={styles.viewHeaderTabs}
            ariaLabel={title}
          />
          {tabActions && <div className={styles.tabActions}>{tabActions}</div>}
        </div>
      )}
    </header>
  );
}
