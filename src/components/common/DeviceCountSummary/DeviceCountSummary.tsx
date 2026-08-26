import type { ReactNode } from 'react';
import styles from './DeviceCountSummary.module.scss';

/**
 * Count summary at the top of the simple lighting / cooling pages, which carry
 * no device list of their own. The line arrives translated - the page owns the
 * plural key and the noun (devices on lighting, fans on cooling).
 */
export function DeviceCountSummary({ detected, action }: {
  /** Translated summary line, e.g. "{controlled}/{total} fans controlled". */
  detected: string;
  /** Trailing control acting on the counts, e.g. a "control all" button. */
  action?: ReactNode;
}) {
  return (
    <div className={styles.summary}>
      <span className={styles.detected}>{detected}</span>
      {action}
    </div>
  );
}
