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
  /** Default true: both variants stay mounted in one reserved grid cell so
   *  the control keeps the width of the wider (detached) state and switching
   *  never shifts the row. Pass false where an adjacent right-aligned element
   *  should track the control's live/detached width instead (the monitoring
   *  events toggle sits immediately left of it and moves with it). */
  reserveWidth?: boolean;
}

/**
 * Live / back-to-live toggle for a metric history header (monitoring page,
 * Diagnostics > Cooling).
 */
export function LiveFollowControl({ following, detachedLabel, onBackToLive, reserveWidth = true }: LiveFollowControlProps) {
  const { t } = useTranslation();
  // Reserved: the inactive variant stays laid out (visibility hidden) so the
  // cell keeps its width. Natural: the inactive variant is removed from
  // layout so the control is only as wide as the active state.
  const hiddenClass = reserveWidth ? styles.liveControlHidden : styles.liveControlGone;
  return (
    <div className={styles.liveControl}>
      <span
        className={`${styles.liveControlSlot} ${following ? '' : hiddenClass}`}
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
        className={`${styles.backToLive} ${styles.liveControlSlot} ${following ? hiddenClass : ''}`}
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
