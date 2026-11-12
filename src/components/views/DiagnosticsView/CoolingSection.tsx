import { useEffect, useState } from 'react';
import { Fan } from 'lucide-react';
import { useIgnoredComponents, useUnitPrefs } from '../../../hooks/useUiSettings';
import { useTranslation } from '../../../lib/i18n';
import { formatNumber, localizeNumbers } from '../../../lib/units';
import { EmptyState } from '../../common/EmptyState/EmptyState';
import { StatusRow } from '../../common/StatusRow/StatusRow';
import { Badge } from '../../common/Badge/Badge';
import { SectionHeader } from '../../common/SectionHeader/SectionHeader';
import type { DiagnosticsCoolingResponse } from '../../../api/diagnostics';
import { NotAvailableNote, SectionLoadError } from './DiagnosticsSectionStates';
import { coolingDetailKey, coolingStatusColor, coolingStatusLabelKey, relativeTimeLabel, resolveSectionState, UNAVAILABLE } from './diagnosticsHelpers';
import { MonitorToggle } from './MonitorToggle';
import styles from './DiagnosticsView.module.scss';

interface CoolingSectionProps {
  data: DiagnosticsCoolingResponse | null;
  loading: boolean;
  error: boolean;
  onRefresh: () => void;
  /** Optional group header - the Cooling tab labels this "Fans"; standalone
   *  renders (tests) pass none and stay headerless. */
  heading?: string;
}

export function CoolingSection({ data, loading, error, onRefresh, heading }: CoolingSectionProps) {
  const { t } = useTranslation();
  const { numberFormat } = useUnitPrefs();
  const { isIgnored, toggle } = useIgnoredComponents();
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
    <section className={styles.section}>
      {heading && <SectionHeader>{heading}</SectionHeader>}
      {state === 'error' && <SectionLoadError onRetry={() => onRefresh()} loading={loading} />}
      {state === 'notSupported' && <NotAvailableNote />}
      {state === 'empty' && <EmptyState compact icon={<Fan size={22} />} title={t('diagnostics.cooling.empty')} />}
      {state === 'content' && data && (
        <div className={styles.coolingList}>
          {data.devices.map(device => {
            // Health ids are "cooling:<deviceId>" (DiagnosticsHealthModel.cs).
            const id = `cooling:${device.id}`;
            const ignored = isIgnored(id);
            return (
              <StatusRow
                key={device.id}
                name={device.name}
                dimmed={ignored}
                danger={!ignored && device.status === 'stalled'}
                value={ignored ? undefined : (
                  <>
                    {device.rpm !== null ? `${formatNumber(device.rpm, numberFormat)} RPM` : UNAVAILABLE}
                    {' '}
                    {device.targetDutyPercent !== null ? localizeNumbers(`${device.targetDutyPercent}%`, numberFormat) : UNAVAILABLE}
                  </>
                )}
                chip={ignored ? undefined : <Badge label={t(coolingStatusLabelKey(device.status))} color={coolingStatusColor(device.status)} />}
                note={!ignored && device.status !== 'ok'
                  ? (
                    <>
                      {coolingDetailKey(device.status) && t(coolingDetailKey(device.status) ?? '')}
                      {coolingDetailKey(device.status) && device.sinceUtc && <br />}
                      {device.sinceUtc && t('diagnostics.cooling.since', { time: relativeTimeLabel(device.sinceUtc, now, t) })}
                    </>
                  )
                  : undefined}
                toggle={<MonitorToggle monitored={!ignored} onChange={() => toggle(id)} />}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}
