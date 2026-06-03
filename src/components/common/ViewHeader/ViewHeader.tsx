import type { ReactNode } from 'react';
import { InfoTooltip } from '../InfoTooltip/InfoTooltip';
import { Tabs, type TabDef } from '../Tabs/Tabs';
import { useCommandPaletteOptional } from '../../../search/CommandPaletteContext';
import { CommandSearchTrigger } from '../../../search/CommandSearchTrigger';
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
  /** Right-aligned widget at the same vertical level as the tabs. Overlaid via
   *  absolute positioning so the tabs' underline bar stays full width. */
  tabActions?: ReactNode;
}

export function ViewHeader({ title, tabs, activeTab, onTabChange, tabsDisabled, titleTooltip, actions, tabActions }: ViewHeaderProps) {
  // When the command palette is mounted (desktop dashboard), the page title is
  // rendered as a search bar that opens it. Without a provider (panel kiosk /
  // iOS) it stays a plain heading.
  const palette = useCommandPaletteOptional();
  return (
    <header className={styles.header}>
      <div className={styles.titleRow}>
        {/* leftGroup keeps a -webkit-app-region: no-drag carve-out around
            the title + (i) tooltip so hover/click reach those elements
            instead of being claimed by the shell's window-move handler. */}
        <div className={styles.leftGroup}>
          <div className={styles.titleCluster}>
            {palette
              ? <CommandSearchTrigger pageTitle={title} />
              : <h1 className={styles.title}>{title}</h1>}
            {titleTooltip && <InfoTooltip message={titleTooltip} side="bottom" />}
          </div>
        </div>
        {actions && <div className={styles.actions}>{actions}</div>}
      </div>
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
