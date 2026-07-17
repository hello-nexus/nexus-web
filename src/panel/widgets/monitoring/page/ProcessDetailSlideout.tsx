import { useState, type ReactNode } from 'react';
import {
  Check, Copy, Cpu, FolderOpen, Gpu, Layers, MemoryStick, XCircle,
} from 'lucide-react';
import { Slideout } from '../../../../components/common/Slideout/Slideout';
import { CollapsibleSection } from '../../../../components/common/CollapsibleSection/CollapsibleSection';
import { ConfirmModal } from '../../../../components/common/ConfirmModal/ConfirmModal';
import { Button } from '../../../../components/common/Button/Button';
import { Badge } from '../../../../components/common/Badge/Badge';
import { SystemSpecsPanel, type SystemSpecRow } from '../../../../components/common/SystemSpecsPanel/SystemSpecsPanel';
import { useToastSafe } from '../../../../components/common/Toast/Toast';
import { useTranslation } from '../../../../lib/i18n';
import { useUnitPrefs } from '../../../../hooks/useUiSettings';
import { formatMemoryMb } from '../../../../lib/formatMemory';
import { localizeNumbers } from '../../../../lib/units';
import { relativeTimeLabel } from '../../../../components/views/DiagnosticsView/diagnosticsHelpers';
import { useMonitoringProcessInfo } from '../../../../hooks/useMonitoringProcessInfo';
import { killMonitoringProcess, openMonitoringProcessLocation } from '../../../../api/monitoringProcessActions';
import type { UseMetricHistoryAppsResult } from '../../../../hooks/useMetricHistoryApps';
import type { PrivacySession } from '../../../../api/monitoringPrivacy';
import { PRIVACY_ICONS, formatPrivacyTime, iconKindForCapability } from './privacyHelpers';
import { ProcessIcon } from './ProcessIcon';
import { ProcessMiniChart } from './ProcessMiniChart';
import { sessionsForProcess, truncateMiddle, type ProcessLiveUsage } from './processDetailHelpers';
import styles from './ProcessDetailSlideout.module.scss';

export interface ProcessDetailSlideoutProps {
  onClose: () => void;
  name: string;
  live: ProcessLiveUsage | undefined;
  /** The active tab's already-fetched window-scoped apps response - reused
   *  (no new fetch) for the mini chart. */
  appsWindow: UseMetricHistoryAppsResult | undefined;
  /** The active tab's own value formatter, so the mini chart reads in the
   *  same unit (%, MB/GB, rate) as the row it was opened from. */
  valueFormat: (value: number) => string;
  privacySessions: readonly PrivacySession[];
  privacySupported: boolean;
}

const PATH_TRUNCATE_CHARS = 46;

function formatAbsolute(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

function CopyableValue({ value, mono, truncate }: { value: string; mono?: boolean; truncate?: boolean }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Browsers without async clipboard support fall back to a no-op - same
      // acceptance as SystemSpecsPanel's own copy toolbar.
    }
  };

  const display = truncate ? truncateMiddle(value, PATH_TRUNCATE_CHARS) : value;
  return (
    <div className={styles.copyableRow}>
      <span className={`${styles.rowValue} ${mono ? styles.mono : ''}`} title={value}>{display}</span>
      <button
        type="button"
        className={styles.copyBtn}
        onClick={() => void onCopy()}
        aria-label={copied ? t('monitoring.processDetail.copied') : t('monitoring.processDetail.copy')}
      >
        {copied ? <Check size={13} aria-hidden /> : <Copy size={13} aria-hidden />}
      </button>
    </div>
  );
}

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={styles.infoRow}>
      <span className={styles.rowLabel}>{label}</span>
      {children}
    </div>
  );
}

/**
 * Process-detail slideout - the same visual pattern as the panel editor's
 * desktop add-widget drawer (see Slideout.tsx), opened when a
 * ProcessListSection row is clicked. Every section below the header/actions
 * handles its own unsupported/empty/error state independently, so a partial
 * (or pre-parallel-branch) service still shows a useful drawer instead of a
 * blank one.
 */
export function ProcessDetailSlideout({
  onClose, name, live, appsWindow, valueFormat, privacySessions, privacySupported,
}: ProcessDetailSlideoutProps) {
  const { t } = useTranslation();
  const { numberFormat } = useUnitPrefs();
  const toast = useToastSafe();
  const info = useMonitoringProcessInfo(true, name);

  const [killConfirmOpen, setKillConfirmOpen] = useState(false);
  const [killing, setKilling] = useState(false);
  const [killError, setKillError] = useState<string | null>(null);
  const [openingLocation, setOpeningLocation] = useState(false);
  const [infoOpen, setInfoOpen] = useState(true);
  const [privacyOpen, setPrivacyOpen] = useState(true);

  const handleKillConfirm = async () => {
    if (killing) return;
    setKilling(true);
    setKillError(null);
    const result = await killMonitoringProcess(name);
    setKilling(false);
    if (result && !result.error) {
      setKillConfirmOpen(false);
      toast.push({ title: t('monitoring.processDetail.kill.success', { name }) });
      onClose();
      return;
    }
    setKillError(result?.msg || t('monitoring.processDetail.kill.failed', { name }));
  };

  const handleOpenLocation = async () => {
    if (openingLocation) return;
    setOpeningLocation(true);
    const result = await openMonitoringProcessLocation(name);
    setOpeningLocation(false);
    if (!result || result.error) {
      toast.push({ title: t('monitoring.processDetail.openLocation.failed') });
    }
  };

  const data = info.data;
  const instanceCount = data?.instanceCount;
  const displayName = (data?.description?.trim()) || name;

  const liveTiles: SystemSpecRow[] = [];
  if (live) {
    if (live.cpuPercent !== undefined) {
      liveTiles.push({ icon: <Cpu size={16} />, label: t('monitoring.processDetail.live.cpu'), value: localizeNumbers(`${Math.round(live.cpuPercent)}%`, numberFormat) });
    }
    if (live.memoryMb !== undefined) {
      liveTiles.push({ icon: <MemoryStick size={16} />, label: t('monitoring.processDetail.live.memory'), value: formatMemoryMb(live.memoryMb, numberFormat) });
    }
    if (live.gpuPercent !== undefined) {
      liveTiles.push({ icon: <Gpu size={16} />, label: t('monitoring.processDetail.live.gpu'), value: localizeNumbers(`${Math.round(live.gpuPercent)}%`, numberFormat) });
    }
    if (live.vramMb !== undefined) {
      liveTiles.push({ icon: <Layers size={16} />, label: t('monitoring.processDetail.live.vram'), value: formatMemoryMb(live.vramMb, numberFormat) });
    }
  }

  const chartSupported = !!appsWindow?.supported && !!appsWindow?.ready;
  const chartSeries = appsWindow?.apps.find(a => a.name === name) ?? null;

  const sessions = sessionsForProcess(privacySessions, name);
  const showPrivacy = privacySupported && sessions.length > 0;

  const now = Date.now();
  const relativeAndAbsolute = (ms: number) => `${relativeTimeLabel(new Date(ms).toISOString(), now, t)} · ${formatAbsolute(ms)}`;

  return (
    <>
      <Slideout
        open
        onClose={onClose}
        ariaLabel={t('monitoring.processDetail.ariaLabel', { name })}
        icon={<ProcessIcon name={name} />}
        title={(
          <div className={styles.headerTitle}>
            <span className={styles.headerName}>{displayName}</span>
            {(instanceCount !== undefined || data?.publisher) && (
              <span className={styles.headerMeta}>
                {instanceCount !== undefined && (
                  instanceCount === 1
                    ? t('monitoring.processDetail.instances.one', { count: instanceCount })
                    : t('monitoring.processDetail.instances.other', { count: instanceCount })
                )}
                {instanceCount !== undefined && data?.publisher && ' · '}
                {data?.publisher}
              </span>
            )}
          </div>
        )}
      >
        <div className={styles.actionsRow}>
          <Button tone="danger" size="sm" icon={<XCircle size={14} aria-hidden />} onClick={() => setKillConfirmOpen(true)}>
            {t('monitoring.processDetail.actions.kill')}
          </Button>
          <Button
            tone="neutral"
            size="sm"
            icon={<FolderOpen size={14} aria-hidden />}
            loading={openingLocation}
            onClick={() => void handleOpenLocation()}
          >
            {t('monitoring.processDetail.actions.openLocation')}
          </Button>
        </div>

        {liveTiles.length > 0 ? (
          <div className={styles.liveGrid}>
            <SystemSpecsPanel variant="tiles" rows={liveTiles} />
          </div>
        ) : (
          <p className={styles.sectionNote}>{t('monitoring.processDetail.live.unavailable')}</p>
        )}

        <div className={styles.chartSection}>
          {!chartSupported ? (
            <p className={styles.sectionNote}>{t('monitoring.processDetail.chart.unsupported')}</p>
          ) : !chartSeries || chartSeries.points.length < 2 ? (
            <p className={styles.sectionNote}>{t('monitoring.processDetail.chart.noData')}</p>
          ) : (
            <>
              <ProcessMiniChart points={chartSeries.points} />
              <div className={styles.chartMeta}>
                {t('monitoring.history.avg')} {valueFormat(chartSeries.avg)} · {t('monitoring.history.max')} {valueFormat(chartSeries.max)}
              </div>
            </>
          )}
        </div>

        <CollapsibleSection title={t('monitoring.processDetail.info.title')} open={infoOpen} onToggle={() => setInfoOpen(v => !v)}>
          {!info.supported ? (
            <p className={styles.sectionNote}>{t('monitoring.processDetail.info.unsupported')}</p>
          ) : info.error && !data ? (
            <p className={styles.sectionNote}>{t('monitoring.processDetail.info.error')}</p>
          ) : !data ? (
            <p className={styles.sectionNote}>{t('monitoring.processDetail.info.loading')}</p>
          ) : (
            <div className={styles.infoBody}>
              {data.version && (
                <InfoRow label={t('monitoring.processDetail.info.version')}>
                  <span className={styles.rowValue}>{data.version}</span>
                </InfoRow>
              )}
              {data.description && (
                <InfoRow label={t('monitoring.processDetail.info.description')}>
                  <span className={styles.rowValue}>{data.description}</span>
                </InfoRow>
              )}
              {data.publisher && (
                <InfoRow label={t('monitoring.processDetail.info.publisher')}>
                  <span className={styles.rowValue}>{data.publisher}</span>
                  {data.signed === false && <Badge label={t('monitoring.processDetail.info.unsigned')} color="var(--warn)" />}
                </InfoRow>
              )}
              {data.path && (
                <InfoRow label={t('monitoring.processDetail.info.path')}>
                  <CopyableValue value={data.path} truncate />
                </InfoRow>
              )}
              {data.sha256 && (
                <InfoRow label={t('monitoring.processDetail.info.sha256')}>
                  <CopyableValue value={data.sha256} mono />
                </InfoRow>
              )}
              {data.createdAtMs !== undefined && (
                <InfoRow label={t('monitoring.processDetail.info.created')}>
                  <span className={styles.rowValue}>{formatAbsolute(data.createdAtMs)}</span>
                </InfoRow>
              )}
              {data.modifiedAtMs !== undefined && (
                <InfoRow label={t('monitoring.processDetail.info.modified')}>
                  <span className={styles.rowValue}>{formatAbsolute(data.modifiedAtMs)}</span>
                </InfoRow>
              )}
              {data.startedAtMs !== undefined && (
                <InfoRow label={t('monitoring.processDetail.info.started')}>
                  <span className={styles.rowValue}>{relativeAndAbsolute(data.startedAtMs)}</span>
                </InfoRow>
              )}
              {data.firstSeenMs !== undefined && (
                <InfoRow label={t('monitoring.processDetail.info.firstSeen')}>
                  <span className={styles.rowValue}>{relativeAndAbsolute(data.firstSeenMs)}</span>
                </InfoRow>
              )}
            </div>
          )}
        </CollapsibleSection>

        {showPrivacy && (
          <CollapsibleSection title={t('monitoring.processDetail.privacy.title')} open={privacyOpen} onToggle={() => setPrivacyOpen(v => !v)}>
            <div className={styles.privacyBody}>
              {sessions.map((s, i) => {
                const Icon = PRIVACY_ICONS[iconKindForCapability(s.capability)];
                const timeText = s.end === null
                  ? t('monitoring.privacy.since', { time: formatPrivacyTime(s.start) })
                  : t('monitoring.privacy.until', { time: formatPrivacyTime(s.end) });
                return (
                  <div key={i} className={styles.privacyRow}>
                    <Icon size={14} aria-hidden />
                    <span className={styles.rowLabel}>{t(`monitoring.privacy.capability.${s.capability}`)}</span>
                    <span className={styles.privacyTime}>{timeText}</span>
                  </div>
                );
              })}
            </div>
          </CollapsibleSection>
        )}
      </Slideout>

      <ConfirmModal
        open={killConfirmOpen}
        title={t('monitoring.processDetail.kill.confirmTitle', { name })}
        message={t('monitoring.processDetail.kill.confirmMessage', { name })}
        confirmLabel={t('monitoring.processDetail.kill.confirmButton')}
        confirmDisabled={killing}
        onConfirm={() => void handleKillConfirm()}
        onCancel={() => { setKillConfirmOpen(false); setKillError(null); }}
      >
        {killError && <p className={styles.killError} role="alert">{killError}</p>}
      </ConfirmModal>
    </>
  );
}
