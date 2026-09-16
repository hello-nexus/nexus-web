import { useEffect, useState } from 'react';
import classNames from 'classnames';
import { Droplet, Fan } from 'lucide-react';
import { useIgnoredComponents, useUnitPrefs } from '../../../hooks/useUiSettings';
import { useTranslation } from '../../../lib/i18n';
import { formatNumber, localizeNumbers } from '../../../lib/units';
import { EmptyState } from '../../common/EmptyState/EmptyState';
import { Badge } from '../../common/Badge/Badge';
import { SectionHeader } from '../../common/SectionHeader/SectionHeader';
import type { DiagnosticsCoolingResponse } from '../../../api/diagnostics';
import { NotAvailableNote, SectionLoadError } from './DiagnosticsSectionStates';
import { coolingStatusColor, coolingStatusLabelKey, relativeTimeLabel, resolveSectionState, UNAVAILABLE } from './diagnosticsHelpers';
import { IgnoreToggle } from './IgnoreToggle';
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
              <div
                key={device.id}
                className={classNames(styles.coolingRow, !ignored && device.status === 'stalled' && styles.coolingRowStalled)}
              >
                <span className={styles.coolingName}>
                  {device.type === 'pump' ? <Droplet size={14} aria-hidden /> : <Fan size={14} aria-hidden />}
                  {device.name}
                </span>
                <span className={styles.coolingMeta}>
                  <span>{device.rpm !== null ? `${formatNumber(device.rpm, numberFormat)} RPM` : UNAVAILABLE}</span>
                  <span>{device.targetDutyPercent !== null ? localizeNumbers(`${device.targetDutyPercent}%`, numberFormat) : UNAVAILABLE}</span>
                  {ignored
                    ? <Badge label={t('diagnostics.ignore.badge')} color="var(--text-dim)" />
                    : <Badge label={t(coolingStatusLabelKey(device.status))} color={coolingStatusColor(device.status)} />}
                  {!ignored && device.sinceUtc && device.status !== 'ok' && (
                    <span>{t('diagnostics.cooling.since', { time: relativeTimeLabel(device.sinceUtc, now, t) })}</span>
                  )}
                  <IgnoreToggle compact ignored={ignored} onToggle={() => toggle(id)} />
                </span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
