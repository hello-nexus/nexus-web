import type { ClockDesignProps } from './types';
import { useFitWidth } from '../useFitWidth';
import styles from './DigitalClock.module.scss';

function DigitalClock({ now, tz, showSeconds, showDate, size, hour12, useAccentColor }: ClockDesignProps) {
  const { boxRef, contentRef, scale } = useFitWidth();
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
      <div ref={boxRef} className={styles.fitBox}>
        <div ref={contentRef} className={styles.time} style={{ transform: `scale(${scale})` }}>{time}</div>
      </div>
      {dateStr && <div className={styles.date}>{dateStr}</div>}
    </div>
  );
}

export default DigitalClock;
