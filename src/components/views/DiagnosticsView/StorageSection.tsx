import { useState } from 'react';
import { HardDrive } from 'lucide-react';
import { useUnitPrefs } from '../../../hooks/useUiSettings';
import { useTranslation } from '../../../lib/i18n';
import { convertTemperature, formatNumber, localizeNumbers, tempUnitSymbol } from '../../../lib/units';
import { SectionHeader } from '../../common/SectionHeader/SectionHeader';
import { Card } from '../../common/Card/Card';
import { Badge } from '../../common/Badge/Badge';
import { EmptyState } from '../../common/EmptyState/EmptyState';
import { CollapsibleSection } from '../../common/CollapsibleSection/CollapsibleSection';
import { InfoList, InfoRow } from '../../common/InfoList/InfoList';
import { InfoTooltip } from '../../common/InfoTooltip/InfoTooltip';
import { UsageBar } from '../../common/UsageBar/UsageBar';
import type { DiagnosticsDrive, DiagnosticsFetchOptions, DiagnosticsSmartResponse, SmartAttribute } from '../../../api/diagnostics';
import { NotAvailableNote, SectionLoadError } from './DiagnosticsSectionStates';
import { diagnosticsSectionAnchorId, driveStatusColor, driveStatusLabelKey, formatBytes, resolveSectionState } from './diagnosticsHelpers';
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

  return (
    <section className={styles.section} id={diagnosticsSectionAnchorId('storage')}>
      <SectionHeader>{t('diagnostics.kind.storage')}</SectionHeader>
      {state === 'error' && <SectionLoadError onRetry={() => onRefresh({ force: true })} loading={loading} />}
      {state === 'notSupported' && <NotAvailableNote />}
      {state === 'empty' && <EmptyState compact icon={<HardDrive size={22} />} title={t('diagnostics.storage.empty')} />}
      {state === 'content' && data && (
        <div className={styles.driveGrid}>
          {data.drives.map(drive => <DriveCard key={drive.id} drive={drive} />)}
        </div>
      )}
    </section>
  );
}

function DriveCard({ drive }: { drive: DiagnosticsDrive }) {
  const { t } = useTranslation();
  const { monitoringTempUnit, numberFormat } = useUnitPrefs();
  const [attrsOpen, setAttrsOpen] = useState(false);

  return (
    <Card
      title={drive.name}
      subtitle={t(`diagnostics.storage.bus.${drive.bus}`)}
      actions={<Badge label={t(driveStatusLabelKey(drive.status))} color={driveStatusColor(drive.status)} />}
    >
      <div className={styles.driveHead}>
        <InfoList>
          <InfoRow label={t('diagnostics.storage.serial')} value={drive.serial} />
          <InfoRow label={t('diagnostics.storage.size')} value={formatBytes(drive.sizeBytes, numberFormat)} />
          <InfoRow
            label={t('diagnostics.storage.temperature')}
            value={drive.temperatureC !== null ? localizeNumbers(`${Math.round(convertTemperature(drive.temperatureC, monitoringTempUnit))}${tempUnitSymbol(monitoringTempUnit)}`, numberFormat) : '-'}
          />
          <InfoRow label={t('diagnostics.storage.powerOnHours')} value={`${formatNumber(drive.powerOnHours, numberFormat)}h`} />
          <InfoRow label={t('diagnostics.storage.powerCycles')} value={formatNumber(drive.powerCycles, numberFormat)} />
        </InfoList>
      </div>
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

      {drive.attributes.length > 0 && (
        <CollapsibleSection
          title={t('diagnostics.storage.attributesToggle')}
          open={attrsOpen}
          onToggle={() => setAttrsOpen(o => !o)}
        >
          <SmartAttributeTable attributes={drive.attributes} />
        </CollapsibleSection>
      )}

      {drive.nvme && (
        <div className={styles.nvmePanel}>
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
    </Card>
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
