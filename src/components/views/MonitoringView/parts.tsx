import { useMemo } from 'react';
import { ChevronDown } from 'lucide-react';
import classNames from 'classnames';
import type { HardwareSensor } from '../../../hooks/useSensors';
import { useTranslation } from '../../../lib/i18n';
import { groupByType } from './shared';
import styles from './MonitoringView.module.scss';

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
  const groups = useMemo(() => groupByType(sensors), [sensors]);
  return (
    <section className={styles.detailSection} data-section-id={id}>
      <button
        type="button"
        className={styles.detailHeader}
        onClick={() => onToggle(id)}
        aria-expanded={!collapsed}
      >
        <ChevronDown
          size={16}
          className={classNames(styles.detailChevron, { [styles.detailChevronCollapsed]: collapsed })}
        />
        <span className={styles.detailTitle}>{title}</span>
        {subtitle && <span className={styles.detailSubtitle}>{subtitle}</span>}
      </button>
      {!collapsed && (
        <div className={styles.detailBody}>
          {groups.map(group => (
            <div key={group.type} className={styles.detailGroup}>
              <div className={styles.detailGroupLabel}>{groupTypeLabel(group.type)}</div>
              {group.sensors.map(s => (
                <div key={s.id} className={styles.detailRow}>
                  <span className={styles.detailRowLabel}>{s.name}</span>
                  <span className={styles.detailRowValue}>{s.formatted || `${s.value}`}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
