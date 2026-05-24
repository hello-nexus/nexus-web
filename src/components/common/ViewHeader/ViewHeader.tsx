import type { ReactNode } from 'react';
import classNames from 'classnames';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { InfoTooltip } from '../InfoTooltip/InfoTooltip';
import { HoverTooltip } from '../HoverTooltip/HoverTooltip';
import { Tabs, type TabDef } from '../Tabs/Tabs';
import { useNavHistory } from '../../../hooks/useNavHistory';
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
  const nav = useNavHistory();
  return (
    <header className={styles.header}>
      <div className={styles.titleRow}>
        <div className={styles.leftGroup}>
          {nav && <NavArrows nav={nav} />}
          <div className={styles.titleCluster}>
            <h1 className={styles.title}>{title}</h1>
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

function NavArrows({ nav }: { nav: NonNullable<ReturnType<typeof useNavHistory>> }) {
  const { canGoBack, canGoForward, goBack, goForward } = nav;
  return (
    <div className={styles.navArrows}>
      <HoverTooltip body="Back" side="bottom">
        <button
          type="button"
          className={classNames(styles.navArrow, { [styles.navArrowDisabled]: !canGoBack })}
          onClick={goBack}
          disabled={!canGoBack}
          aria-label="Back"
        >
          <ChevronLeft size={14} aria-hidden />
        </button>
      </HoverTooltip>
      <HoverTooltip body="Forward" side="bottom">
        <button
          type="button"
          className={classNames(styles.navArrow, { [styles.navArrowDisabled]: !canGoForward })}
          onClick={goForward}
          disabled={!canGoForward}
          aria-label="Forward"
        >
          <ChevronRight size={14} aria-hidden />
        </button>
      </HoverTooltip>
    </div>
  );
}
