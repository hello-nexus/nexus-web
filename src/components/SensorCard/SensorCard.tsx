import type { HardwareSensor } from '../../hooks/useSensors';
import { Card } from '../Card/Card';
import styles from './SensorCard.module.scss';

interface SensorCardProps {
  title: string;
  subtitle?: string;
  sensors: HardwareSensor[];
}

/* Compact sensor display: title + optional subtitle + name/value rows. The
   Card primitive owns the chrome; this file owns the sensor row layout. */
export function SensorCard({ title, subtitle, sensors }: SensorCardProps) {
  return (
    <Card title={title} subtitle={subtitle} className={styles.sensorCard}>
      {sensors.map((s) => (
        <div key={s.id} className={styles.sensor}>
          <span className={styles.label}>{s.name}</span>
          <span className={styles.value}>{s.formatted || `${s.value}`}</span>
        </div>
      ))}
    </Card>
  );
}
