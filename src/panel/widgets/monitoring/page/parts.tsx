import { useMemo } from 'react';
import { CollapsibleSection } from '../../../../components/common/CollapsibleSection/CollapsibleSection';
import type { HardwareSensor } from '../../../../hooks/useSensors';
import { useUnitPrefs } from '../../../../hooks/useUiSettings';
import { formatSensorValue } from '../sensorValueFormat';
import { groupByType } from './shared';
import styles from '../MonitoringPage.module.scss';

// Full-width boxed section (see CollapsibleSection's `boxed` prop). Click
// anywhere on the header to toggle the body; no sticky positioning, no scroll
// spying -- the headers scroll with content. Two nesting levels of the same
// collapsible primitive: the family header (this section, boxed) and, per
// sensor-type group inside it, a compact nested one (unboxed, indented within
// the family's own box). Both read/write the same flat `isCollapsed`/
// `onToggle` id set - a group's id is the family id plus its sensor type
// (`${id}/${group.type}`).
export function DetailSection({
  id, title, subtitle, sensors, isCollapsed, onToggle, groupTypeLabel,
}: {
  id: string;
  title: string;
  subtitle?: string;
  sensors: HardwareSensor[];
  isCollapsed: (id: string) => boolean;
  onToggle: (id: string) => void;
  groupTypeLabel: (type: string) => string;
}) {
  const { monitoringTempUnit, numberFormat } = useUnitPrefs();
  const groups = useMemo(() => groupByType(sensors), [sensors]);
  return (
    <CollapsibleSection
      boxed
      className={styles.detailSection}
      sectionId={id}
      title={title}
      open={!isCollapsed(id)}
      onToggle={() => onToggle(id)}
      right={subtitle ? <span className={styles.detailSubtitle}>{subtitle}</span> : undefined}
    >
      <div className={styles.detailBody}>
        {groups.map(group => {
          const groupId = `${id}/${group.type}`;
          return (
            <CollapsibleSection
              key={group.type}
              compact
              className={styles.detailGroup}
              sectionId={groupId}
              title={groupTypeLabel(group.type)}
              open={!isCollapsed(groupId)}
              onToggle={() => onToggle(groupId)}
            >
              {group.sensors.map(s => (
                <div key={s.id} className={styles.detailRow}>
                  <span className={styles.detailRowLabel}>{s.name}</span>
                  <span className={styles.detailRowValue}>{formatSensorValue(s.value, s.units, s.formatted, monitoringTempUnit, numberFormat) || `${s.value}`}</span>
                </div>
              ))}
            </CollapsibleSection>
          );
        })}
      </div>
    </CollapsibleSection>
  );
}
