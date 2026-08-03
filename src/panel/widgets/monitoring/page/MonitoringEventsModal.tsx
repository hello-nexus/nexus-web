import { useEffect, useRef } from 'react';
import { useTranslation } from '../../../../lib/i18n';
import { Overlay } from '../../../../components/common/Overlay/Overlay';
import { Button } from '../../../../components/common/Button/Button';
import { CHART_EVENT_ICONS } from '../../../../components/common/TimeSeriesChart/TimeSeriesChart';
import type { MonitoringEventKind, TimelineEvent } from '../../../../api/monitoringEvents';
import { useEventKindVisibility } from './useEventKindVisibility';
import { eventKindLabel, formatEventTime, formatPrivacyDuration } from './monitoringEventLabels';
import styles from './MonitoringEventsModal.module.scss';

interface MonitoringEventsModalProps {
  open: boolean;
  onClose: () => void;
  events: readonly TimelineEvent[];
  /** Marker the user clicked, highlighted and scrolled to on open. */
  highlightedKey: string | null;
  onRemoveCustom: (id: number) => void;
}

/**
 * Recent timeline events, newest first, with the clicked marker highlighted.
 * Only custom events expose a remove action - a system event can be ignored
 * by kind but never deleted, since the store is a record of what happened.
 */
export function MonitoringEventsModal({
  open, onClose, events, highlightedKey, onRemoveCustom,
}: MonitoringEventsModalProps) {
  const { t } = useTranslation();
  const { setKindHidden } = useEventKindVisibility();
  const highlightRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    if (open && highlightRef.current) {
      highlightRef.current.scrollIntoView({ block: 'center' });
    }
  }, [open, highlightedKey]);

  if (!open) return null;

  const newestFirst = [...events].sort((a, b) => b.t - a.t);

  const ignoreKind = (kind: MonitoringEventKind) => setKindHidden(kind, true);

  return (
    <Overlay open={open} onClose={onClose} variant="dialog"
      className={styles.modal} ariaLabel={t('monitoring.events.modalTitle')}>
      <h2 className={styles.title}>{t('monitoring.events.modalTitle')}</h2>
      <p className={styles.description}>{t('monitoring.events.modalDescription')}</p>

      {newestFirst.length === 0 ? (
        <p className={styles.empty}>{t('monitoring.events.none')}</p>
      ) : (
        <ul className={styles.list}>
          {newestFirst.map(event => {
            const Icon = CHART_EVENT_ICONS[event.kind];
            const highlighted = event.key === highlightedKey;
            return (
              <li
                key={event.key}
                ref={highlighted ? highlightRef : undefined}
                className={highlighted ? `${styles.row} ${styles.highlighted}` : styles.row}
              >
                <span className={styles.rowIcon} aria-hidden="true"><Icon size={14} /></span>
                <span className={styles.rowText}>
                  <span className={styles.rowLabel}>{event.label}</span>
                  <span className={styles.rowMeta}>
                    {eventKindLabel(t, event.kind)}
                    {event.detail ? ` · ${event.detail}` : ''}
                  </span>
                </span>
                <span className={styles.rowTime}>
                  {formatEventTime(event.t)}
                  {event.endT !== null || event.kind.startsWith('privacy-')
                    ? ` · ${formatPrivacyDuration(t, event.t, event.endT)}`
                    : ''}
                </span>
                <span className={styles.rowActions}>
                  <button
                    type="button"
                    className={styles.ignoreBtn}
                    onClick={() => ignoreKind(event.kind)}
                  >
                    {t('monitoring.events.ignoreKind')}
                  </button>
                  {event.custom && event.id !== null && (
                    <button
                      type="button"
                      className={styles.removeBtn}
                      onClick={() => onRemoveCustom(event.id as number)}
                    >
                      {t('monitoring.events.remove')}
                    </button>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      <div className={styles.actions}>
        <Button tone="accent" onClick={onClose}>
          {t('monitoring.events.close')}
        </Button>
      </div>
    </Overlay>
  );
}
