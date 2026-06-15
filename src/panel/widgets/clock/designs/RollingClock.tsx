import type { ClockDesignProps } from './types';
import { formatTime, getAmPm } from './timeFormat';
import { useFitWidth } from '../useFitWidth';
import styles from './RollingClock.module.scss';

const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

function RollingDigit({ digit }: { digit: number }) {
  return (
    <div className={styles.digitWrapper}>
      <div
        className={styles.digitColumn}
        style={{ transform: `translateY(${-digit * 10}%)` }}
      >
        {DIGITS.map(d => (
          <div key={d} className={styles.digitCell}>{d}</div>
        ))}
      </div>
    </div>
  );
}

function RollingClock({ now, tz, showSeconds, showDate, size, hour12, useAccentColor }: ClockDesignProps) {
  const time = formatTime(now, tz, showSeconds, hour12);
  const ampm = getAmPm(now, tz, hour12);
  const sizeClass = styles[`size-${size}`] ?? styles['size-4x2'];
  const { boxRef, contentRef, scale } = useFitWidth();

  const dateStr = showDate ? new Intl.DateTimeFormat(undefined, {
    weekday: 'short', month: 'short', day: 'numeric',
    timeZone: tz || undefined,
  }).format(now) : '';

  // Parse into segments: digit groups separated by colons
  const segments: { type: 'digits' | 'colon'; chars: string[] }[] = [];
  let currentDigits: string[] = [];

  for (const ch of time) {
    if (ch === ':') {
      if (currentDigits.length) {
        segments.push({ type: 'digits', chars: [...currentDigits] });
        currentDigits = [];
      }
      segments.push({ type: 'colon', chars: [':'] });
    } else {
      currentDigits.push(ch);
    }
  }
  if (currentDigits.length) {
    segments.push({ type: 'digits', chars: [...currentDigits] });
  }

  return (
    <div className={`${styles.container} ${sizeClass} ${useAccentColor ? styles.accent : ''}`}>
      <div ref={boxRef} className={styles.fitBox}>
        <div ref={contentRef} className={styles.row} style={{ transform: `scale(${scale})` }}>
          {segments.map((seg, si) =>
            seg.type === 'colon' ? (
              <div key={si} className={styles.colon}>
                <span className={styles.colonDot} />
                <span className={styles.colonDot} />
              </div>
            ) : (
              seg.chars.map((ch, ci) => (
                <RollingDigit key={`${si}-${ci}`} digit={parseInt(ch, 10)} />
              ))
            )
          )}
          {ampm && <div className={styles.ampm}>{ampm}</div>}
        </div>
      </div>
      {dateStr && <div className={styles.date}>{dateStr}</div>}
    </div>
  );
}

export default RollingClock;
