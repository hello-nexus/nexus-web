import { useMemo } from 'react';
import type { ClockDesignProps } from './types';
import styles from './AnalogClock.module.scss';

// Get time parts respecting timezone
function getTimeParts(now: Date, tz?: string) {
  if (!tz) {
    return { hours: now.getHours(), minutes: now.getMinutes(), seconds: now.getSeconds() };
  }
  const parts = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric', minute: 'numeric', second: 'numeric',
    hour12: false, timeZone: tz,
  }).formatToParts(now);
  const get = (type: string) => parseInt(parts.find(p => p.type === type)?.value ?? '0', 10);
  return { hours: get('hour'), minutes: get('minute'), seconds: get('second') };
}

function AnalogClock({ now, tz, showSeconds, showDate, size, useAccentColor }: ClockDesignProps) {
  const { hours, minutes, seconds } = getTimeParts(now, tz);

  // Continuous rotation for smooth hand movement
  const secondDeg = seconds * 6;
  const minuteDeg = minutes * 6 + seconds * 0.1;
  const hourDeg = (hours % 12) * 30 + minutes * 0.5;

  const dateStr = showDate ? new Intl.DateTimeFormat(undefined, {
    weekday: 'short', month: 'short', day: 'numeric',
    timeZone: tz || undefined,
  }).format(now) : '';

  const sizeClass = styles[`size-${size}`] ?? styles['size-4x2'];

  // Hour markers at 30-degree intervals
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
      {dateStr && <div className={styles.date}>{dateStr}</div>}
    </div>
  );
}

export default AnalogClock;
