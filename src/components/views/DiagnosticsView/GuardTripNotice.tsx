import { useState } from 'react';
import type { GuardResponse } from '../../../api/cooling';
import { useThermalGuard } from '../../../hooks/useThermalGuard';
import { useTranslation } from '../../../lib/i18n';
import { formatDateTime, hour12OptionFor } from '../../../lib/units';
import { useUnitPrefs } from '../../../hooks/useUiSettings';
import { Button } from '../../common/Button/Button';
import { Notice, NoticeSecondary } from '../../common/Notice/Notice';
import styles from './GuardTripNotice.module.scss';

// Matches the window the health component keeps a trip at watch.
const NOTICE_WINDOW_MS = 24 * 60 * 60 * 1000;

interface GuardTripNoticeViewProps {
  guard: GuardResponse | null;
  /** The current time, for the 24 hour window. */
  nowMs: number;
  /** A dismissal is in flight; Dismiss disables so a double click sends one request. */
  dismissing?: boolean;
  error: string | null;
  onDismiss: () => void;
  onOpenCooling?: () => void;
}

/** The notice for an unacknowledged thermal guard trip, active or ended. Shows nothing otherwise. */
export function GuardTripNoticeView({ guard, nowMs, dismissing = false, error, onDismiss, onOpenCooling }: GuardTripNoticeViewProps) {
  const { t, language } = useTranslation();
  const { timeFormat, dateFormat } = useUnitPrefs();
  const trip = guard?.lastTrip;
  if (!trip || trip.acknowledged) return null;

  const active = trip.endedAtUtcMs == null;
  // An ended trip older than the health window no longer shows: the tile has long since cleared.
  if (!active && nowMs - (trip.endedAtUtcMs ?? 0) > NOTICE_WINDOW_MS) return null;
  const time = formatDateTime(
    new Date(trip.atUtcMs),
    dateFormat,
    { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: hour12OptionFor(timeFormat) },
    { locale: language },
  );
  const cause = trip.reason === 'cooling-loss'
    ? t('diagnostics.cooling.guardTrip.causeLoss')
    : t('diagnostics.cooling.guardTrip.causeLimit');

  return (
    <Notice
      tone="warning"
      role="status"
      className={styles.notice}
      actions={active ? (
        onOpenCooling && (
          <Button type="button" size="sm" tone="neutral" onClick={onOpenCooling}>
            {t('diagnostics.cooling.guardTrip.openCooling')}
          </Button>
        )
      ) : (
        <Button type="button" size="sm" disabled={dismissing} onClick={onDismiss}>{t('diagnostics.cooling.guardTrip.dismiss')}</Button>
      )}
    >
      <span className={styles.headline}>
        {active
          ? t('diagnostics.cooling.guardTrip.active')
          : t('diagnostics.cooling.guardTrip.ended', { time, peak: Math.round(trip.peakC) })}
      </span>
      <NoticeSecondary>{cause}</NoticeSecondary>
      {error && <span role="alert">{error}</span>}
    </Notice>
  );
}

interface GuardTripNoticeProps {
  serviceOnline: boolean;
  onOpenCooling?: () => void;
  /** Called after the service accepted the dismissal, so the health tile and cooling data refresh. */
  onDismissed: () => void;
}

export function GuardTripNotice({ serviceOnline, onOpenCooling, onDismissed }: GuardTripNoticeProps) {
  const { guard, fetchedAtMs, ackError, acknowledgeTrip } = useThermalGuard(serviceOnline);
  const [dismissing, setDismissing] = useState(false);
  return (
    <GuardTripNoticeView
      guard={guard}
      nowMs={fetchedAtMs}
      dismissing={dismissing}
      error={ackError?.message ?? null}
      onOpenCooling={onOpenCooling}
      onDismiss={() => {
        if (dismissing) return;
        setDismissing(true);
        void acknowledgeTrip()
          .then(ok => { if (ok) onDismissed(); })
          .finally(() => setDismissing(false));
      }}
    />
  );
}
