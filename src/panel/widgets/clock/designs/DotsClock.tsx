import type { ReactElement } from 'react';
import type { ClockDesignProps } from './types';
import { formatMetaLine, formatTime, getAmPm } from './timeFormat';
import { ClockDate, ClockLine, splitTimeLines, useClockFit } from './layout';
import styles from './DotsClock.module.scss';

// 3x5 dot matrix patterns for digits 0-9; 5 rows of 3 bits each.
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

function DotsClock({ now, tz, showSeconds, showDate, showTimezone, size, hour12, useAccentColor, layout }: ClockDesignProps) {
  const time = formatTime(now, tz, showSeconds, hour12);
  const ampm = getAmPm(now, tz, hour12);
  const stacked = layout === 'stacked';
  const lines = splitTimeLines(time, layout);
  const sizeClass = styles[`size-${size}`] ?? styles['size-4x2'];
  const { boxRef, contentRef, scale } = useClockFit(stacked);

  const dateStr = formatMetaLine(now, tz, showDate, showTimezone);

  const lineCells = (line: string): ReactElement[] => {
    const elements: ReactElement[] = [];
    let colonIdx = 0;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === ':') {
        elements.push(<DotColon key={`c${colonIdx++}`} />);
      } else {
        elements.push(<DotDigit key={`d${i}`} digit={ch} />);
      }
    }
    return elements;
  };

  return (
    <div className={`${styles.container} ${sizeClass} ${stacked ? styles.stacked : ''} ${useAccentColor ? styles.accent : ''}`}>
      <div ref={boxRef} className={styles.fitBox}>
        <div ref={contentRef} className={styles.lines} style={{ transform: `scale(${scale})` }}>
          {lines.map((line, li) => (
            <div key={li} className={styles.row}>
              <ClockLine ampm={li === 0 ? ampm : undefined} ampmClass={styles.ampm}>
                {lineCells(line)}
              </ClockLine>
            </div>
          ))}
        </div>
      </div>
      {dateStr && <ClockDate text={dateStr} className={styles.date} />}
    </div>
  );
}

export default DotsClock;
