import { ArrowRight } from 'lucide-react';
import { Badge } from '../Badge/Badge';
import { useTranslation } from '../../../lib/i18n';
import styles from './LiveFollowControl.module.scss';

export interface LiveFollowControlProps {
  following: boolean;
  /** The viewed frame's time, already formatted by the caller (the same
   *  formatter its chart's x-axis uses) - shown in place of the Live badge
   *  once detached. Not translated: a clock time, not display copy. */
  detachedLabel: string;
  onBackToLive: () => void;
}

/**
 * Live / back-to-live toggle for a metric history header (monitoring page,
 * Diagnostics > Cooling). Both variants stay mounted in the same reserved
 * grid cell - only the inactive one is hidden - so switching never shifts
 * the row it sits in.
 */
export function LiveFollowControl({ following, detachedLabel, onBackToLive }: LiveFollowControlProps) {
  const { t } = useTranslation();
  return (
    <div className={styles.liveControl}>
      <span
        className={`${styles.liveControlSlot} ${following ? '' : styles.liveControlHidden}`}
        aria-hidden={!following}
      >
        <Badge
          label={t('monitoring.history.live')}
          color="var(--good)"
          icon={<span className={styles.liveDot} aria-hidden />}
          iconPosition="end"
        />
      </span>
      <button
        type="button"
        className={`${styles.backToLive} ${styles.liveControlSlot} ${following ? styles.liveControlHidden : ''}`}
        onClick={onBackToLive}
        tabIndex={following ? -1 : 0}
        aria-hidden={following}
        aria-label={t('monitoring.history.backToLive')}
      >
        {detachedLabel}
        <ArrowRight size={12} aria-hidden />
      </button>
    </div>
  );
}
