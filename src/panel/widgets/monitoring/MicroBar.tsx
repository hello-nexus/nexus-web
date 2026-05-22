import { splitFormatted } from './gauges/format';
import styles from './MicroBar.module.scss';

interface MicroBarProps {
  label: string;
  formatted: string;
  fillPercent: number;
}

export function MicroBar({ label, formatted, fillPercent }: MicroBarProps) {
  const clamped = Math.max(0, Math.min(100, fillPercent));
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
      <div className={styles.track}>
        <div className={styles.fill} style={{ width: `${clamped}%` }} />
      </div>
    </div>
  );
}
