import { useProcessIcon } from '../../../../hooks/useProcessIcon';
import styles from './ProcessListSection.module.scss';

/** Row icon: GET /monitoring/process-icon keyed by the raw process name (see
 *  useProcessIcon - a session-cached lookup, primary source), falling back
 *  to a plain neutral dot when nothing resolves - the dot carries no
 *  per-app color, matching the sparkline's accent-only treatment.
 *
 *  Shared by ProcessListSection's rows, MetricHistorySection's hover-tooltip
 *  top-apps rows, and ProcessDetailSlideout's header - kept in its own file
 *  (rather than living in ProcessListSection.tsx, which also renders
 *  ProcessDetailSlideout) so none of those three form a circular import. */
export function ProcessIcon({ name }: { name: string }) {
  const iconUrl = useProcessIcon(name);
  // The slot itself is the fixed-size box (item 44): whichever of the two
  // variants below renders, the next sibling (the row label) sits at the
  // same x position, whether the icon loaded, failed, or is still pending -
  // the failed/pending states are visually identical (both the dot), so the
  // only two states that matter here are "loaded" vs "not loaded".
  return (
    <span className={styles.iconSlot}>
      {iconUrl ? <img src={iconUrl} className={styles.appIcon} alt="" /> : <span className={styles.dot} />}
    </span>
  );
}
