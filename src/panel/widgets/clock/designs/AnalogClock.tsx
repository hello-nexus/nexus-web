import { useMemo } from 'react';
import type { ClockDesignProps } from './types';
import { formatMetaLine, getClockAngles } from './timeFormat';
import { ClockDate } from './layout';
import styles from './AnalogClock.module.scss';

function AnalogClock({ now, tz, showSeconds, showDate, showTimezone, size, useAccentColor }: ClockDesignProps) {
  const { hourDeg, minuteDeg, secondDeg } = getClockAngles(now, tz);

  const dateStr = formatMetaLine(now, tz, showDate, showTimezone);

  const sizeClass = styles[`size-${size}`] ?? styles['size-4x2'];

  const markers = useMemo(() =>
    Array.from({ length: 12 }, (_, i) => {
      const angle = i * 30;
      return <line
        key={i}
        className={i % 3 === 0 ? styles.markerMajor : styles.marker}
        x1="50" y1="8" x2="50" y2={i % 3 === 0 ? '16' : '13'}
        transform={`rotate(${angle} 50 50)`}
      />;
    }), []);

  return (
    <div className={`${styles.container} ${sizeClass} ${useAccentColor ? styles.accent : ''}`}>
      <svg viewBox="0 0 100 100" className={styles.face}>
        <circle cx="50" cy="50" r="46" className={styles.ring} />
        {markers}
        <line
          className={styles.hourHand}
          x1="50" y1="50" x2="50" y2="24"
          style={{ transform: `rotate(${hourDeg}deg)` }}
        />
        <line
          className={styles.minuteHand}
          x1="50" y1="50" x2="50" y2="14"
          style={{ transform: `rotate(${minuteDeg}deg)` }}
        />
        {showSeconds && (
          <line
            className={styles.secondHand}
            x1="50" y1="56" x2="50" y2="12"
            style={{ transform: `rotate(${secondDeg}deg)` }}
          />
        )}
        <circle cx="50" cy="50" r="2.5" className={styles.center} />
      </svg>
      {dateStr && <ClockDate text={dateStr} className={styles.date} />}
    </div>
  );
}

export default AnalogClock;
