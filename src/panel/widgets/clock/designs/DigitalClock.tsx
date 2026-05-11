import type { ClockDesignProps } from './types';
import styles from './DigitalClock.module.scss';

function DigitalClock({ now, tz, showSeconds, showDate, size, hour12, useAccentColor }: ClockDesignProps) {
  const time = new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: showSeconds ? '2-digit' : undefined,
    hour12,
    timeZone: tz || undefined,
  }).format(now);

  const dateStr = showDate ? new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: tz || undefined,
  }).format(now) : '';

  const sizeClass = styles[`size-${size}`] ?? styles['size-4x2'];

  return (
    <div className={`${styles.container} ${sizeClass} ${useAccentColor ? styles.accent : ''}`}>
      <div className={styles.time}>{time}</div>
      {dateStr && <div className={styles.date}>{dateStr}</div>}
    </div>
  );
}

export default DigitalClock;
