import type { FlashStatus } from '../../../hooks/useFlashStatus';
import styles from './FlashProgress.module.scss';

/** Inline firmware flash progress: thin bar plus the service's phase message. */
export function FlashProgress({ status }: { status: FlashStatus }) {
  return (
    <span className={styles.progress}>
      <span className={styles.bar}>
        <span className={styles.fill} style={{ width: `${status.percent}%` }} />
      </span>
      <span className={styles.msg}>{status.message} ({status.percent}%)</span>
    </span>
  );
}
