import type { ReactElement } from 'react';
import type { ClockDesignProps } from './types';
import { formatTime, getAmPm } from './timeFormat';
import styles from './DotsClock.module.scss';

// 3x5 dot matrix patterns for digits 0-9
// Each pattern is 5 rows of 3 bits (stored as arrays for clarity)
const DOT_PATTERNS: Record<string, number[][]> = {
  '0': [[1,1,1],[1,0,1],[1,0,1],[1,0,1],[1,1,1]],
  '1': [[0,1,0],[1,1,0],[0,1,0],[0,1,0],[1,1,1]],
  '2': [[1,1,1],[0,0,1],[1,1,1],[1,0,0],[1,1,1]],
  '3': [[1,1,1],[0,0,1],[1,1,1],[0,0,1],[1,1,1]],
  '4': [[1,0,1],[1,0,1],[1,1,1],[0,0,1],[0,0,1]],
  '5': [[1,1,1],[1,0,0],[1,1,1],[0,0,1],[1,1,1]],
  '6': [[1,1,1],[1,0,0],[1,1,1],[1,0,1],[1,1,1]],
  '7': [[1,1,1],[0,0,1],[0,0,1],[0,0,1],[0,0,1]],
  '8': [[1,1,1],[1,0,1],[1,1,1],[1,0,1],[1,1,1]],
  '9': [[1,1,1],[1,0,1],[1,1,1],[0,0,1],[1,1,1]],
};

function DotDigit({ digit }: { digit: string }) {
  const pattern = DOT_PATTERNS[digit] ?? DOT_PATTERNS['0'];
  return (
    <div className={styles.digit}>
      {pattern.map((row, ri) => (
        <div key={ri} className={styles.dotRow}>
          {row.map((on, ci) => (
            <div key={ci} className={`${styles.dot} ${on ? styles.on : styles.off}`} />
          ))}
        </div>
      ))}
    </div>
  );
}

function DotColon() {
  return (
    <div className={styles.colonWrap}>
      <div className={`${styles.dot} ${styles.on}`} />
      <div className={`${styles.dot} ${styles.on}`} />
    </div>
  );
}

function DotsClock({ now, tz, showSeconds, showDate, size, hour12, useAccentColor }: ClockDesignProps) {
  const time = formatTime(now, tz, showSeconds, hour12);
  const ampm = getAmPm(now, tz, hour12);
  const sizeClass = styles[`size-${size}`] ?? styles['size-4x2'];

  const dateStr = showDate ? new Intl.DateTimeFormat(undefined, {
    weekday: 'short', month: 'short', day: 'numeric',
    timeZone: tz || undefined,
  }).format(now) : '';

  const elements: ReactElement[] = [];
  let colonIdx = 0;

  for (let i = 0; i < time.length; i++) {
    const ch = time[i];
    if (ch === ':') {
      elements.push(<DotColon key={`c${colonIdx++}`} />);
    } else {
      elements.push(<DotDigit key={`d${i}`} digit={ch} />);
    }
  }

  return (
    <div className={`${styles.container} ${sizeClass} ${useAccentColor ? styles.accent : ''}`}>
      <div className={styles.row}>
        {elements}
        {ampm && <div className={styles.ampm}>{ampm}</div>}
      </div>
      {dateStr && <div className={styles.date}>{dateStr}</div>}
    </div>
  );
}

export default DotsClock;
