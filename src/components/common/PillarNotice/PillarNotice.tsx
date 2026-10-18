import type { ReactNode } from 'react';
import { Info } from 'lucide-react';
import { SettingRow } from '../SettingRow/SettingRow';
import styles from './PillarNotice.module.scss';

/**
 * Stands in for the rows of a setting group whose feature pillar is off. The
 * hidden rows' search anchors ride along as data-search-fallback, so a search
 * hit for a hidden setting scrolls to this notice instead of finding nothing
 * (see search/scroll.ts).
 */
export function PillarNotice({ message, anchors, action }: { message: string; anchors: readonly string[]; action?: ReactNode }) {
  const text = <span role="status">{message}</span>;
  return (
    <div data-search-fallback={anchors.join(' ')}>
      <SettingRow
        icon={<Info />}
        iconLeading="subtle"
        description={action ? <span className={styles.withAction}>{text}{action}</span> : text}
      />
    </div>
  );
}
