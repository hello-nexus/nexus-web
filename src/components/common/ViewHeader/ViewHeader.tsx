import type { ReactNode } from 'react';
import { Tabs, type TabDef } from '../Tabs/Tabs';
import styles from './ViewHeader.module.scss';

interface ViewHeaderProps {
  // Page name. No longer rendered as a heading (the top bar shows it) - kept
  // only as the accessible label for the tab strip.
  title: string;
  tabs?: readonly TabDef[];
  activeTab?: string;
  onTabChange?: (key: string, origin?: HTMLButtonElement) => void;
  tabsDisabled?: boolean;
  actions?: ReactNode;
  /** Widget sitting immediately beside the tab bar, sharing the row's gap.
   *  Unlike `tabActions` it stays next to the tabs instead of pinning right. */
  tabsAdjacent?: ReactNode;
  /** Right-aligned widget sharing the tab row: the tab bar takes what it needs
   *  and this keeps its own width beside it. */
  tabActions?: ReactNode;
}

// Page-level tabs use the shared Tabs primitive so every tab bar in the app
// reads as one control. Text-only and icon+text tabs both flow through the
// single component.

export function ViewHeader({ title, tabs, activeTab, onTabChange, tabsDisabled, actions, tabActions, tabsAdjacent }: ViewHeaderProps) {
  const hasTabs = !!tabs && tabs.length > 0;
  return (
    <header className={styles.header}>
      {actions && (
        <div className={styles.titleRow}>
          <div className={styles.actions}>{actions}</div>
        </div>
      )}
      {(hasTabs || tabActions || tabsAdjacent) && (
        <div className={styles.tabsRow}>
          {hasTabs && (
            <Tabs
              tabs={tabs}
              activeKey={activeTab ?? ''}
              onChange={(k, origin) => onTabChange?.(k, origin)}
              disabled={tabsDisabled}
              className={styles.viewHeaderTabs}
              ariaLabel={title}
            />
          )}
          {tabsAdjacent && (
            <div className={styles.tabsAdjacent}>{tabsAdjacent}</div>
          )}
          {tabActions && (
            <div className={styles.tabActions}>{tabActions}</div>
          )}
        </div>
      )}
    </header>
  );
}
