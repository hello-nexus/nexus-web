import type { ClockDesignProps } from './types';
import { formatMetaLine, getClockAngles } from './timeFormat';
import { ClockDate } from './layout';
import styles from './AbstractClock.module.scss';

function AbstractClock({ now, tz, showSeconds, showDate, showTimezone, dateFormat, size }: ClockDesignProps) {
  const { hourDeg, minuteDeg, secondDeg } = getClockAngles(now, tz);
  const dateStr = formatMetaLine(now, tz, showDate, showTimezone, dateFormat);
  const sizeClass = styles[`size-${size}`] ?? styles['size-4x2'];

  return (
    <div
      className={`${styles.container} ${sizeClass}`}
      // The sweep's seam sits under the hour hand, so the fill turns with the hour.
      style={{ '--abstract-angle': `${hourDeg}deg` } as React.CSSProperties}
    >
      <div className={styles.sweep} />
      <svg viewBox="0 0 100 100" className={styles.hands}>
        <line className={styles.hourHand} x1="50" y1="50" x2="50" y2="14" style={{ transform: `rotate(${hourDeg}deg)` }} />
        <line className={styles.minuteHand} x1="50" y1="50" x2="50" y2="-14" style={{ transform: `rotate(${minuteDeg}deg)` }} />
        {showSeconds && (
          <line className={styles.secondHand} x1="50" y1="50" x2="50" y2="22" style={{ transform: `rotate(${secondDeg}deg)` }} />
        )}
        <circle cx="50" cy="50" r="1.6" className={styles.center} />
      </svg>
      {dateStr && <div className={styles.scrim} />}
      {dateStr && <ClockDate text={dateStr} className={styles.date} />}
    </div>
  );
}

export default AbstractClock;
