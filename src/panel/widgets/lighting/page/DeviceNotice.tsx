import { Info } from 'lucide-react';
import { HoverTooltip } from '../../../../components/common/HoverTooltip/HoverTooltip';
import styles from '../LightingPage.module.scss';

/**
 * Small (i) shown at the end of a device label or group title; hover reveals a
 * controller-level advisory. A bare icon, not a button, so it can sit inside the
 * group header's toggle <button> without nesting interactive elements.
 * data-no-dnd + stopPropagation keep a click/drag on the icon from selecting,
 * reordering, or collapsing the surrounding card / group.
 */
export function DeviceNotice({ notice }: { notice: string }) {
  return (
    <HoverTooltip body={notice} side="top">
      <span className={styles.deviceNotice} role="img" aria-label={notice} data-no-dnd onClick={e => e.stopPropagation()}>
        <Info size={14} aria-hidden />
      </span>
    </HoverTooltip>
  );
}
