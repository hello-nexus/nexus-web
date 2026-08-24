import { Badge } from '../Badge/Badge';
import styles from './DeviceCountSummary.module.scss';

/**
 * Detected/driven counts at the top of the simple lighting / cooling pages,
 * which carry no device list of their own. Both strings arrive translated -
 * the page owns the plural key and the noun (devices on lighting, fans on
 * cooling).
 */
export function DeviceCountSummary({ detected, controlled }: {
  /** Translated "{count} devices detected" line. */
  detected: string;
  /** Translated "{count} controlled" badge label. */
  controlled: string;
}) {
  return (
    <div className={styles.summary}>
      <span className={styles.detected}>{detected}</span>
      <Badge label={controlled} compact uppercase color="var(--text-dim)" />
    </div>
  );
}
