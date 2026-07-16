import type { ReactElement } from 'react';
import type { ClockDesignProps } from './types';
import { formatMetaLine, formatTime, getAmPm } from './timeFormat';
import { useFitWidth } from '../useFitWidth';
import styles from './LedClock.module.scss';

// Seven-segment display: segments labeled a-g
//   aaa
//  f   b
//   ggg
//  e   c
//   ddd
const SEGMENT_MAP: Record<string, boolean[]> = {
  //       a     b     c     d     e     f     g
  '0': [true, true, true, true, true, true, false],
  '1': [false, true, true, false, false, false, false],
  '2': [true, true, false, true, true, false, true],
  '3': [true, true, true, true, false, false, true],
  '4': [false, true, true, false, false, true, true],
  '5': [true, false, true, true, false, true, true],
  '6': [true, false, true, true, true, true, true],
  '7': [true, true, true, false, false, false, false],
  '8': [true, true, true, true, true, true, true],
  '9': [true, true, true, true, false, true, true],
};

const SEGMENT_NAMES = ['a', 'b', 'c', 'd', 'e', 'f', 'g'] as const;

function LedDigit({ digit }: { digit: string }) {
  const segments = SEGMENT_MAP[digit] ?? SEGMENT_MAP['0'];

  return (
    <div className={styles.digit}>
      {SEGMENT_NAMES.map((name, i) => (
        <div
          key={name}
          className={`${styles.segment} ${styles[`seg-${name}`]} ${segments[i] ? styles.on : styles.off}`}
        />
      ))}
    </div>
  );
}

function LedColon({ pulse }: { pulse: boolean }) {
  return (
    <div className={styles.colon}>
      <div className={`${styles.colonDot} ${pulse ? styles.on : styles.off}`} />
      <div className={`${styles.colonDot} ${pulse ? styles.on : styles.off}`} />
    </div>
  );
}

function LedClock({ now, tz, showSeconds, showDate, showTimezone, size, hour12, useAccentColor }: ClockDesignProps) {
  const time = formatTime(now, tz, showSeconds, hour12);
  const ampm = getAmPm(now, tz, hour12);
  const colonVisible = now.getSeconds() % 2 === 0;
  const sizeClass = styles[`size-${size}`] ?? styles['size-4x2'];
  const { boxRef, contentRef, scale } = useFitWidth();

  const dateStr = formatMetaLine(now, tz, showDate, showTimezone);

  const elements: ReactElement[] = [];
  let colonIdx = 0;

  for (let i = 0; i < time.length; i++) {
    const ch = time[i];
    if (ch === ':') {
      elements.push(<LedColon key={`c${colonIdx++}`} pulse={colonVisible} />);
    } else {
      elements.push(<LedDigit key={`d${i}`} digit={ch} />);
    }
  }

  return (
    <div className={`${styles.container} ${sizeClass} ${useAccentColor ? styles.accent : ''}`}>
      <div ref={boxRef} className={styles.fitBox}>
        <div ref={contentRef} className={styles.row} style={{ transform: `scale(${scale})` }}>
          {elements}
          {ampm && <div className={styles.ampm}>{ampm}</div>}
        </div>
      </div>
      {dateStr && <div className={styles.date}>{dateStr}</div>}
    </div>
  );
}

export default LedClock;
