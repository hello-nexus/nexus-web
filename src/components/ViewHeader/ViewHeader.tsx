import type { ReactNode } from 'react';
import { InfoTooltip } from '../InfoTooltip/InfoTooltip';
import { Tabs, type TabDef } from '../Tabs/Tabs';
import styles from './ViewHeader.module.scss';

interface ViewHeaderProps {
  title: string;
  tabs?: readonly TabDef[];
  activeTab?: string;
  onTabChange?: (key: string) => void;
  tabsDisabled?: boolean;
  /** Optional one-sentence explanation shown in a hover tooltip next to the title. */
  titleTooltip?: string;
  actions?: ReactNode;
}

export function ViewHeader({ title, tabs, activeTab, onTabChange, tabsDisabled, titleTooltip, actions }: ViewHeaderProps) {
  return (
    <header className={styles.header}>
      <div className={styles.titleRow}>
        <div className={styles.titleCluster}>
          <h1 className={styles.title}>{title}</h1>
          {titleTooltip && <InfoTooltip message={titleTooltip} side="bottom" />}
        </div>
        {actions && <div className={styles.actions}>{actions}</div>}
      </div>
      {tabs && tabs.length > 0 && (
        <Tabs
          tabs={tabs}
          activeKey={activeTab ?? ''}
          onChange={k => onTabChange?.(k)}
          disabled={tabsDisabled}
          className={styles.viewHeaderTabs}
          ariaLabel={title}
        />
      )}
    </header>
  );
}
