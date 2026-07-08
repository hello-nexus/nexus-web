import { useState } from 'react';
import { HardDrive, RefreshCw } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { SectionHeader } from '../../common/SectionHeader/SectionHeader';
import { Card } from '../../common/Card/Card';
import { Badge } from '../../common/Badge/Badge';
import { Button } from '../../common/Button/Button';
import { EmptyState } from '../../common/EmptyState/EmptyState';
import { CollapsibleSection } from '../../common/CollapsibleSection/CollapsibleSection';
import { InfoList, InfoRow } from '../../common/InfoList/InfoList';
import { UsageBar } from '../../common/UsageBar/UsageBar';
import type { DiagnosticsDrive, DiagnosticsSmartResponse, SmartAttribute } from '../../../api/diagnostics';
import { NotAvailableNote, SectionLoadError } from './DiagnosticsSectionStates';
import { driveStatusColor, driveStatusLabelKey, formatBytes, resolveSectionState } from './diagnosticsHelpers';
import styles from './DiagnosticsView.module.scss';

interface StorageSectionProps {
  data: DiagnosticsSmartResponse | null;
  loading: boolean;
  error: boolean;
  onRefresh: () => void;
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
    <section className={styles.section}>
      <div className={styles.sectionHeaderRow}>
        <SectionHeader>{t('diagnostics.kind.storage')}</SectionHeader>
        <Button tone="ghost" size="sm" icon={<RefreshCw size={13} />} title={t('diagnostics.refresh')} aria-label={t('diagnostics.refresh')} onClick={onRefresh} />
      </div>
      {state === 'error' && <SectionLoadError onRetry={onRefresh} />}
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
          <InfoRow label={t('diagnostics.storage.size')} value={formatBytes(drive.sizeBytes)} />
          <InfoRow
            label={t('diagnostics.storage.temperature')}
            value={drive.temperatureC !== null ? `${Math.round(drive.temperatureC)}°C` : '-'}
          />
          <InfoRow label={t('diagnostics.storage.powerOnHours')} value={`${drive.powerOnHours}h`} />
          <InfoRow label={t('diagnostics.storage.powerCycles')} value={String(drive.powerCycles)} />
        </InfoList>
        {drive.healthPercent !== null && (
          <div className={styles.driveHealthBar}>
            <InfoRow label={t('diagnostics.storage.health')} value={`${drive.healthPercent}%`} />
            <UsageBar value={drive.healthPercent / 100} color={driveStatusColor(drive.status)} />
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

      {drive.nvme && (
        <div className={styles.nvmePanel}>
          <SectionHeader>{t('diagnostics.storage.nvme.title')}</SectionHeader>
          <InfoList>
            <InfoRow label={t('diagnostics.storage.nvme.criticalWarning')} value={drive.nvme.criticalWarning} tone={drive.nvme.criticalWarning > 0 ? 'bad' : 'default'} />
            <InfoRow label={t('diagnostics.storage.nvme.availableSpare')} value={`${drive.nvme.availableSpare}%`} />
            <InfoRow label={t('diagnostics.storage.nvme.spareThreshold')} value={`${drive.nvme.spareThreshold}%`} />
            <InfoRow label={t('diagnostics.storage.nvme.percentageUsed')} value={`${drive.nvme.percentageUsed}%`} />
            <InfoRow label={t('diagnostics.storage.nvme.mediaErrors')} value={drive.nvme.mediaErrors} tone={drive.nvme.mediaErrors > 0 ? 'bad' : 'default'} />
            <InfoRow label={t('diagnostics.storage.nvme.errorLogEntries')} value={drive.nvme.errorLogEntries} />
            <InfoRow label={t('diagnostics.storage.nvme.unsafeShutdowns')} value={drive.nvme.unsafeShutdowns} />
            <InfoRow label={t('diagnostics.storage.nvme.dataRead')} value={formatBytes(drive.nvme.dataUnitsReadBytes)} />
            <InfoRow label={t('diagnostics.storage.nvme.dataWritten')} value={formatBytes(drive.nvme.dataUnitsWrittenBytes)} />
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
