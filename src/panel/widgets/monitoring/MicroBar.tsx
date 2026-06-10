import { splitFormatted } from './gauges/format';
import { GaugeTrack } from './gauges/GaugeTrack';
import styles from './MicroBar.module.scss';

interface MicroBarProps {
  label: string;
  formatted: string;
  fillPercent: number;
}

export function MicroBar({ label, formatted, fillPercent }: MicroBarProps) {
  const parts = splitFormatted(formatted);

  return (
    <div className={styles.row}>
      <div className={styles.head}>
        <span className={styles.label}>{label}</span>
        <span className={styles.value}>
          {parts.value}
          {parts.unit && <span className="panel-gauge-unit">{parts.unit}</span>}
        </span>
      </div>
      <GaugeTrack fillPercent={fillPercent} />
    </div>
  );
}
