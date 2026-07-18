import { useEffect, useMemo, useState } from 'react';
import { DeviceModal } from '../../../../components/common/DeviceModal/DeviceModal';
import { SearchInput } from '../../../../components/common/SearchInput/SearchInput';
import { Badge } from '../../../../components/common/Badge/Badge';
import { Button } from '../../../../components/common/Button/Button';
import { useTranslation } from '../../../../lib/i18n';
import { usePrivacyHistory } from '../../../../hooks/usePrivacyHistory';
import { durationLabel } from '../../../../components/views/DiagnosticsView/diagnosticsHelpers';
import {
  appDisplayName, filterSessionsByAppName, formatPrivacyDateTime, iconKindForCapability,
  PRIVACY_ICONS, sortSessionsNewestFirst,
} from './privacyHelpers';
import { ProcessIcon } from './ProcessIcon';
import styles from './PrivacyHistoryModal.module.scss';

interface PrivacyHistoryModalProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Chronological privacy-access history across every app the service has
 * recorded a session for - including apps that have since exited, which the
 * live indicators (ProcessListSection/ProcessDetailPanel) never surface since
 * they key off the current process list. Fetched once per open via
 * usePrivacyHistory (an on-demand audit view, not a live poll); ProcessIcon's
 * own live-process lookup gracefully falls back to the neutral dot for an
 * exited app, so no separate "exited" handling is needed here.
 */
export function PrivacyHistoryModal({ open, onClose }: PrivacyHistoryModalProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const { sessions, retentionDays, loading, error, mocked, supported, reload } = usePrivacyHistory(open);
  // Re-snapshot on every open (not a one-time mount snapshot): MonitoringPage
  // keeps this component mounted across close/reopen, only toggling `open`,
  // so a mount-only snapshot would go stale after the first close and
  // understate every in-use session's duration on a later reopen. An in-use
  // session's duration only needs a stable "now" for the open session, not a
  // live-ticking clock.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (open) setNowMs(Date.now());
  }, [open]);

  const visible = useMemo(
    () => filterSessionsByAppName(sortSessionsNewestFirst(sessions), query),
    [sessions, query],
  );

  const handleClose = () => {
    setQuery('');
    onClose();
  };

  return (
    <DeviceModal open={open} onClose={handleClose} title={t('monitoring.privacy.history.title')} large>
      <div className={styles.content}>
        <div className={styles.searchRow}>
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder={t('monitoring.privacy.history.searchPlaceholder')}
            className={styles.search}
          />
          {mocked && <Badge label={t('monitoring.history.mocked')} color="var(--warn)" />}
        </div>

        <div className={styles.rowsWrap}>
          {!supported ? (
            <div className={styles.empty}>{t('monitoring.privacy.history.unsupported')}</div>
          ) : error ? (
            <div className={styles.empty}>
              <p>{t('monitoring.privacy.history.error')}</p>
              <Button size="sm" tone="neutral" onClick={reload}>{t('monitoring.history.retry')}</Button>
            </div>
          ) : loading && sessions.length === 0 ? (
            <div className={styles.empty}>{t('monitoring.privacy.history.loading')}</div>
          ) : visible.length === 0 ? (
            <div className={styles.empty}>{t('monitoring.privacy.history.empty')}</div>
          ) : (
            <>
              <p className={styles.retentionNote}>
                {t('monitoring.privacy.history.retentionNote', { days: String(retentionDays) })}
              </p>
              {visible.map(s => {
                const name = appDisplayName(s.app);
                const Icon = PRIVACY_ICONS[iconKindForCapability(s.capability)];
                const durationMs = (s.end ?? nowMs) - s.start;
                return (
                  <div key={`${s.app}::${s.capability}::${s.start}`} className={styles.row}>
                    <ProcessIcon name={name} />
                    <div className={styles.rowMain}>
                      <span className={styles.appName}>{name}</span>
                      <span className={styles.capability}>
                        <Icon size={13} aria-hidden />
                        {t(`monitoring.privacy.capability.${s.capability}`)}
                      </span>
                    </div>
                    <div className={styles.rowTime}>
                      {s.end === null
                        ? <Badge label={t('monitoring.privacy.since', { time: formatPrivacyDateTime(s.start) })} color="var(--good)" />
                        : <span>{t('monitoring.privacy.until', { time: formatPrivacyDateTime(s.end) })}</span>}
                      <span className={styles.duration}>{durationLabel(durationMs * 1000, t)}</span>
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>
    </DeviceModal>
  );
}
