import type { ClockDesignProps } from './types';
import { formatMetaLine, formatTime, getAmPm } from './timeFormat';
import { ClockDate, ClockLine, splitTimeLines, useClockFit } from './layout';
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

function RollingClock({ now, tz, showSeconds, showDate, showTimezone, size, hour12, useAccentColor, layout }: ClockDesignProps) {
  const time = formatTime(now, tz, showSeconds, hour12);
  const ampm = getAmPm(now, tz, hour12);
  const stacked = layout === 'stacked';
  const lines = splitTimeLines(time, layout);
  const sizeClass = styles[`size-${size}`] ?? styles['size-4x2'];
  const { boxRef, contentRef, scale } = useClockFit(stacked);

  const dateStr = formatMetaLine(now, tz, showDate, showTimezone);

  // Parse a line into segments: digit groups separated by colons. A stacked
  // line carries no colon, so it yields a single digit group.
  const lineSegments = (line: string) => {
    const segments: { type: 'digits' | 'colon'; chars: string[] }[] = [];
    let currentDigits: string[] = [];

    for (const ch of line) {
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
    return segments;
  };

  return (
    <div className={`${styles.container} ${sizeClass} ${stacked ? styles.stacked : ''} ${useAccentColor ? styles.accent : ''}`}>
      <div ref={boxRef} className={styles.fitBox}>
        <div ref={contentRef} className={styles.lines} style={{ transform: `scale(${scale})` }}>
          {lines.map((line, li) => (
            <div key={li} className={styles.row}>
              <ClockLine ampm={li === 0 ? ampm : undefined} ampmClass={styles.ampm}>
                {lineSegments(line).map((seg, si) =>
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
              </ClockLine>
            </div>
          ))}
        </div>
      </div>
      {dateStr && <ClockDate text={dateStr} className={styles.date} />}
    </div>
  );
}

export default RollingClock;
