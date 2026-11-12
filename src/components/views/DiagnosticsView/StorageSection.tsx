import { useCallback, useEffect, useMemo, useState } from 'react';
import { HardDrive } from 'lucide-react';
import { useIgnoredComponents, useUiSettings, useUnitPrefs } from '../../../hooks/useUiSettings';
import { useTopicCallback } from '../../../hooks/useMultiplexSocket';
import { useTranslation } from '../../../lib/i18n';
import { convertTemperature, formatNumber, localizeNumbers, tempUnitSymbol } from '../../../lib/units';
import { Select, type SelectOption } from '../../common/Select/Select';
import { SectionHeader } from '../../common/SectionHeader/SectionHeader';
import { Card } from '../../common/Card/Card';
import { Badge } from '../../common/Badge/Badge';
import { EmptyState } from '../../common/EmptyState/EmptyState';
import { CollapsibleSection } from '../../common/CollapsibleSection/CollapsibleSection';
import { InfoList, InfoRow } from '../../common/InfoList/InfoList';
import { InfoTooltip } from '../../common/InfoTooltip/InfoTooltip';
import { UsageBar } from '../../common/UsageBar/UsageBar';
import type { DiagnosticsDrive, DiagnosticsFetchOptions, DiagnosticsSmartResponse, SmartAttribute } from '../../../api/diagnostics';
import { fetchSmartPoll, SMART_POLL_CHOICES, type SmartPollDrive } from '../../../api/smartPoll';
import { NotAvailableNote, SectionLoadError } from './DiagnosticsSectionStates';
import { driveStatusColor, driveStatusLabelKey, formatBytes, resolveSectionState, UNAVAILABLE } from './diagnosticsHelpers';
import { MonitorToggle } from './MonitorToggle';
import {
  driveIntervalValue, pairPollDrives, setDriveInterval, smartPollIntervalLabel, SMART_POLL_FOLLOW_DEFAULT,
} from './smartPollHelpers';
import styles from './DiagnosticsView.module.scss';

interface StorageSectionProps {
  data: DiagnosticsSmartResponse | null;
  loading: boolean;
  error: boolean;
  onRefresh: (opts?: DiagnosticsFetchOptions) => void;
}

export function StorageSection({ data, loading, error, onRefresh }: StorageSectionProps) {
  const { t } = useTranslation();
  const state = resolveSectionState({
    hasData: data !== null,
    loading,
    error,
    supported: data?.supported ?? false,
    isEmpty: (data?.drives.length ?? 0) === 0,
  });

  // The poll list keys drives by hardware path; each card pairs its drive to one by model name.
  const [pollDrives, setPollDrives] = useState<SmartPollDrive[]>([]);
  const loadPoll = useCallback(() => {
    void fetchSmartPoll().then(res => { if (res) setPollDrives(res.drives); }).catch(() => { /* the card shows no interval control */ });
  }, []);
  useEffect(() => { loadPoll(); }, [loadPoll]);
  useTopicCallback('smart-poll', true, loadPoll);
  const paired = useMemo(() => pairPollDrives(data?.drives ?? [], pollDrives), [data, pollDrives]);

  return (
    <section className={styles.section}>
      {state === 'error' && <SectionLoadError onRetry={() => onRefresh({ force: true })} loading={loading} />}
      {state === 'notSupported' && <NotAvailableNote />}
      {state === 'empty' && <EmptyState compact icon={<HardDrive size={22} />} title={t('diagnostics.storage.empty')} />}
      {state === 'content' && data && (
        <div className={styles.driveGrid}>
          {data.drives.map(drive => <DriveCard key={drive.id} drive={drive} pollDrive={paired.get(drive.id)} allPollDrives={pollDrives} onPollChanged={loadPoll} />)}
        </div>
      )}
    </section>
  );
}

function DriveCard({ drive, pollDrive, allPollDrives, onPollChanged }: {
  drive: DiagnosticsDrive;
  pollDrive?: SmartPollDrive;
  allPollDrives: SmartPollDrive[];
  onPollChanged: () => void;
}) {
  const { t } = useTranslation();
  const { monitoringTempUnit, numberFormat } = useUnitPrefs();
  const { isIgnored, toggle } = useIgnoredComponents();
  const [attrsOpen, setAttrsOpen] = useState(false);
  const ignored = isIgnored(drive.id);
  const { settings, update } = useUiSettings();
  const pollState = { seconds: settings.smartPollSeconds, defaultSeconds: settings.smartPollDefaultSeconds, perDrive: settings.smartPollPerDrive };
  const pollOptions = useMemo<SelectOption[]>(() => [
    { value: SMART_POLL_FOLLOW_DEFAULT, label: t('diagnostics.storage.poll.default', { interval: smartPollIntervalLabel(t, settings.smartPollDefaultSeconds) }) },
    ...SMART_POLL_CHOICES.map(seconds => ({ value: String(seconds), label: smartPollIntervalLabel(t, seconds) })),
  ], [t, settings.smartPollDefaultSeconds]);

  return (
    <div className={styles.driveBlock}>
      <div className={styles.sectionHeaderRow}>
        <div className={styles.driveHeading}>
          <SectionHeader>{drive.name}</SectionHeader>
          <span className={styles.driveBus}>{t(`diagnostics.storage.bus.${drive.bus}`)}</span>
        </div>
        <div className={styles.driveHeaderActions}>
          {pollDrive && (
            <Select
              value={driveIntervalValue(pollState, pollDrive)}
              options={pollOptions}
              ariaLabel={t('diagnostics.storage.poll.label')}
              onChange={value => { update(setDriveInterval(pollState, allPollDrives, pollDrive.id, value)); onPollChanged(); }}
            />
          )}
          {ignored
            ? <Badge label={t('diagnostics.monitor.off')} color="var(--text-dim)" />
            : <Badge label={t(driveStatusLabelKey(drive.status))} color={driveStatusColor(drive.status)} />}
          <MonitorToggle monitored={!ignored} onChange={() => toggle(drive.id)} />
        </div>
      </div>
      <Card>
        {/* Two columns when the drive has an NVMe log: overview left, NVMe
            right, each headed so their lists start on the same line. Without
            one, the overview alone spans the card. */}
        <div className={styles.driveColumns}>
          <div className={styles.driveColumn}>
            {drive.nvme && <SectionHeader>{t('diagnostics.storage.overviewTitle')}</SectionHeader>}
            <InfoList>
              <InfoRow label={t('diagnostics.storage.serial')} value={drive.serial} />
              <InfoRow
                label={t('diagnostics.storage.size')}
                value={drive.sizeBytes !== null ? formatBytes(drive.sizeBytes, numberFormat) : UNAVAILABLE}
              />
              <InfoRow
                label={t('diagnostics.storage.temperature')}
                value={drive.temperatureC !== null ? localizeNumbers(`${Math.round(convertTemperature(drive.temperatureC, monitoringTempUnit))}${tempUnitSymbol(monitoringTempUnit)}`, numberFormat) : UNAVAILABLE}
              />
              <InfoRow
                label={t('diagnostics.storage.powerOnHours')}
                value={drive.powerOnHours !== null ? `${formatNumber(drive.powerOnHours, numberFormat)}h` : UNAVAILABLE}
              />
              <InfoRow
                label={t('diagnostics.storage.powerCycles')}
                value={drive.powerCycles !== null ? formatNumber(drive.powerCycles, numberFormat) : UNAVAILABLE}
              />
            </InfoList>
            {drive.healthPercent !== null && (
              <div className={styles.driveHealthSection}>
                <InfoRow
                  label={
                    <span className={styles.healthLabelRow}>
                      {t('diagnostics.storage.health')}
                      <InfoTooltip message={t('diagnostics.storage.healthInfo')} side="top" />
                    </span>
                  }
                  value={localizeNumbers(`${drive.healthPercent}%`, numberFormat)}
                />
                <UsageBar value={drive.healthPercent / 100} color={driveStatusColor(drive.status)} />
              </div>
            )}
          </div>

          {drive.nvme && (
            <div className={styles.driveColumn}>
              <SectionHeader>{t('diagnostics.storage.nvme.title')}</SectionHeader>
              <InfoList>
                <InfoRow label={t('diagnostics.storage.nvme.criticalWarning')} value={drive.nvme.criticalWarning} tone={drive.nvme.criticalWarning > 0 ? 'bad' : 'default'} />
                <InfoRow label={t('diagnostics.storage.nvme.availableSpare')} value={localizeNumbers(`${drive.nvme.availableSpare}%`, numberFormat)} />
                <InfoRow label={t('diagnostics.storage.nvme.spareThreshold')} value={localizeNumbers(`${drive.nvme.spareThreshold}%`, numberFormat)} />
                <InfoRow label={t('diagnostics.storage.nvme.percentageUsed')} value={localizeNumbers(`${drive.nvme.percentageUsed}%`, numberFormat)} />
                <InfoRow label={t('diagnostics.storage.nvme.mediaErrors')} value={drive.nvme.mediaErrors} tone={drive.nvme.mediaErrors > 0 ? 'bad' : 'default'} />
                <InfoRow label={t('diagnostics.storage.nvme.errorLogEntries')} value={drive.nvme.errorLogEntries} />
                <InfoRow label={t('diagnostics.storage.nvme.unsafeShutdowns')} value={drive.nvme.unsafeShutdowns} />
                <InfoRow label={t('diagnostics.storage.nvme.dataRead')} value={formatBytes(drive.nvme.dataUnitsReadBytes, numberFormat)} />
                <InfoRow label={t('diagnostics.storage.nvme.dataWritten')} value={formatBytes(drive.nvme.dataUnitsWrittenBytes, numberFormat)} />
              </InfoList>
            </div>
          )}
        </div>

        {drive.attributes.length > 0 && (
          <CollapsibleSection
            title={t('diagnostics.storage.attributesToggle')}
            open={attrsOpen}
            onToggle={() => setAttrsOpen(o => !o)}
          >
            <SmartAttributeTable attributes={drive.attributes} />
          </CollapsibleSection>
        )}
      </Card>
    </div>
  );
}

function SmartAttributeTable({ attributes }: { attributes: SmartAttribute[] }) {
  const { t } = useTranslation();
  return (
    <div className={styles.attrTableWrap}>
      <table className={styles.attrTable}>
        <thead>
          <tr>
            <th>{t('diagnostics.storage.attr.col.id')}</th>
            <th>{t('diagnostics.storage.attr.col.name')}</th>
            <th>{t('diagnostics.storage.attr.col.current')}</th>
            <th>{t('diagnostics.storage.attr.col.worst')}</th>
            <th>{t('diagnostics.storage.attr.col.threshold')}</th>
            <th>{t('diagnostics.storage.attr.col.raw')}</th>
          </tr>
        </thead>
        <tbody>
          {attributes.map(attr => (
            <tr key={attr.id} className={attr.flagged ? styles.attrFlagged : undefined}>
              <td>{attr.id}</td>
              <td>{attr.name}</td>
              <td>{attr.current}</td>
              <td>{attr.worst}</td>
              <td>{attr.threshold}</td>
              <td>{attr.raw}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
