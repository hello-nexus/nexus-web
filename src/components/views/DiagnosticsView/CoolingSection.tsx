import { useEffect, useState } from 'react';
import classNames from 'classnames';
import { Droplet, Fan } from 'lucide-react';
import { useUnitPrefs } from '../../../hooks/useUiSettings';
import { useTranslation } from '../../../lib/i18n';
import { formatNumber, localizeNumbers } from '../../../lib/units';
import { SectionHeader } from '../../common/SectionHeader/SectionHeader';
import { EmptyState } from '../../common/EmptyState/EmptyState';
import { Badge } from '../../common/Badge/Badge';
import type { DiagnosticsCoolingResponse } from '../../../api/diagnostics';
import { NotAvailableNote, SectionLoadError } from './DiagnosticsSectionStates';
import { coolingStatusColor, coolingStatusLabelKey, diagnosticsSectionAnchorId, relativeTimeLabel, resolveSectionState } from './diagnosticsHelpers';
import styles from './DiagnosticsView.module.scss';

interface CoolingSectionProps {
  data: DiagnosticsCoolingResponse | null;
  loading: boolean;
  error: boolean;
  onRefresh: () => void;
}

export function CoolingSection({ data, loading, error, onRefresh }: CoolingSectionProps) {
  const { t } = useTranslation();
  const { numberFormat } = useUnitPrefs();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { setNow(Date.now()); }, [data]);
  const state = resolveSectionState({
    hasData: data !== null,
    loading,
    error,
    supported: data?.supported ?? false,
    isEmpty: (data?.devices.length ?? 0) === 0,
  });

  return (
    <section className={styles.section} id={diagnosticsSectionAnchorId('cooling')}>
      <SectionHeader>{t('diagnostics.kind.cooling')}</SectionHeader>
      {state === 'error' && <SectionLoadError onRetry={() => onRefresh()} loading={loading} />}
      {state === 'notSupported' && <NotAvailableNote />}
      {state === 'empty' && <EmptyState compact icon={<Fan size={22} />} title={t('diagnostics.cooling.empty')} />}
      {state === 'content' && data && (
        <div className={styles.coolingList}>
          {data.devices.map(device => (
            <div
              key={device.id}
              className={classNames(styles.coolingRow, device.status === 'stalled' && styles.coolingRowStalled)}
            >
              <span className={styles.coolingName}>
                {device.type === 'pump' ? <Droplet size={14} aria-hidden /> : <Fan size={14} aria-hidden />}
                {device.name}
              </span>
              <span className={styles.coolingMeta}>
                <span>{`${formatNumber(device.rpm, numberFormat)} RPM`}</span>
                <span>{localizeNumbers(`${device.targetDutyPercent}%`, numberFormat)}</span>
                <Badge label={t(coolingStatusLabelKey(device.status))} color={coolingStatusColor(device.status)} />
                {device.sinceUtc && device.status !== 'ok' && (
                  <span>{t('diagnostics.cooling.since', { time: relativeTimeLabel(device.sinceUtc, now, t) })}</span>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
