import { Info } from 'lucide-react';
import { SettingRow } from '../SettingRow/SettingRow';

/**
 * Stands in for the rows of a setting group whose feature pillar is off. The
 * hidden rows' search anchors ride along as data-search-fallback, so a search
 * hit for a hidden setting scrolls to this notice instead of finding nothing
 * (see search/scroll.ts).
 */
export function PillarNotice({ message, anchors }: { message: string; anchors: readonly string[] }) {
  return (
    <div data-search-fallback={anchors.join(' ')}>
      <SettingRow icon={<Info />} iconLeading="subtle" description={<span role="status">{message}</span>} />
    </div>
  );
}
