import { useMemo } from 'react';
import { CollapsibleSection } from '../../../../components/common/CollapsibleSection/CollapsibleSection';
import type { HardwareSensor } from '../../../../hooks/useSensors';
import { useUnitPrefs } from '../../../../hooks/useUiSettings';
import { useTranslation } from '../../../../lib/i18n';
import { formatSensorValue } from '../sensorValueFormat';
import { groupByType } from './shared';
import styles from '../MonitoringPage.module.scss';

export function RankedToggle({ showAverage, onToggle }: { showAverage: boolean; onToggle: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="chip-group">
      <button
        type="button"
        className={`chip-action${!showAverage ? ' chip-active' : ''}`}
        onClick={() => { if (showAverage) onToggle(); }}
      >
        {t('monitoring.mode.live')}
      </button>
      <button
        type="button"
        className={`chip-action${showAverage ? ' chip-active' : ''}`}
        onClick={() => { if (!showAverage) onToggle(); }}
      >
        {t('monitoring.mode.60s')}
      </button>
    </div>
  );
}

// Plain in-flow section. Click anywhere on the header to toggle the body.
// No sticky positioning, no scroll spying -- the headers scroll with content.
export function DetailSection({
  id, title, subtitle, sensors, collapsed, onToggle, groupTypeLabel,
}: {
  id: string;
  title: string;
  subtitle?: string;
  sensors: HardwareSensor[];
  collapsed: boolean;
  onToggle: (id: string) => void;
  groupTypeLabel: (type: string) => string;
}) {
  const { monitoringTempUnit, numberFormat } = useUnitPrefs();
  const groups = useMemo(() => groupByType(sensors), [sensors]);
  return (
    <CollapsibleSection
      className={styles.detailSection}
      sectionId={id}
      title={title}
      open={!collapsed}
      onToggle={() => onToggle(id)}
      right={subtitle ? <span className={styles.detailSubtitle}>{subtitle}</span> : undefined}
    >
      <div className={styles.detailBody}>
        {groups.map(group => (
          <div key={group.type} className={styles.detailGroup}>
            <div className={styles.detailGroupLabel}>{groupTypeLabel(group.type)}</div>
            {group.sensors.map(s => (
              <div key={s.id} className={styles.detailRow}>
                <span className={styles.detailRowLabel}>{s.name}</span>
                <span className={styles.detailRowValue}>{formatSensorValue(s.value, s.units, s.formatted, monitoringTempUnit, numberFormat) || `${s.value}`}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </CollapsibleSection>
  );
}
