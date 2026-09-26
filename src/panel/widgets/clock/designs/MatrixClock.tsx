import { useEffect, useRef, useState } from 'react';
import type { ClockDesignProps } from './types';
import { formatMetaLine, formatTime, getAmPm } from './timeFormat';
import { ClockDate, ClockLine, splitTimeLines, useClockFit } from './layout';
import styles from './MatrixClock.module.scss';

const SCRAMBLE_CHARS = '0123456789#$%&@!?*+=/\\<>[]{}~^';
const SCRAMBLE_ITERATIONS = 8;
const SCRAMBLE_INTERVAL_MS = 50;

function useScrambleChar(target: string): { display: string; settling: boolean } {
  const [display, setDisplay] = useState(target);
  const [settling, setSettling] = useState(false);
  const prevRef = useRef(target);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const countRef = useRef(0);

  useEffect(() => {
    if (target === prevRef.current) return;
    prevRef.current = target;

    // Don't scramble non-digit characters - snap directly to the final
    // glyph so colons and spaces don't flicker through random chars.
    if (target === ':' || target === ' ') {
       
      setDisplay(target);
      return;
    }

    countRef.current = 0;
    setSettling(false);

    const tick = () => {
      countRef.current++;
      if (countRef.current >= SCRAMBLE_ITERATIONS) {
        setDisplay(target);
        setSettling(true);
        // Clear the settling glow.
        timerRef.current = setTimeout(() => setSettling(false), 300);
        return;
      }
      const idx = Math.floor(Math.random() * SCRAMBLE_CHARS.length);
      setDisplay(SCRAMBLE_CHARS[idx]);
      timerRef.current = setTimeout(tick, SCRAMBLE_INTERVAL_MS);
    };

    timerRef.current = setTimeout(tick, SCRAMBLE_INTERVAL_MS);

    return () => clearTimeout(timerRef.current);
  }, [target]);

  return { display, settling };
}

function ScrambleChar({ char }: { char: string }) {
  const { display, settling } = useScrambleChar(char);
  const isColon = char === ':';

  return (
    <span className={`${styles.char} ${settling ? styles.glow : ''} ${isColon ? styles.colonChar : ''}`}>
      {display}
    </span>
  );
}

function MatrixClock({ now, tz, showSeconds, showDate, showTimezone, dateFormat, size, hour12, useAccentColor, layout }: ClockDesignProps) {
  const time = formatTime(now, tz, showSeconds, hour12);
  const ampm = getAmPm(now, tz, hour12);
  const stacked = layout === 'stacked';
  const lines = splitTimeLines(time, layout);
  const sizeClass = styles[`size-${size}`] ?? styles['size-4x2'];
  const { boxRef, contentRef, scale } = useClockFit(stacked);

  const dateStr = formatMetaLine(now, tz, showDate, showTimezone, dateFormat);

  return (
    <div className={`${styles.container} ${sizeClass} ${stacked ? styles.stacked : ''} ${useAccentColor ? styles.accent : ''}`}>
      <div ref={boxRef} className={styles.fitBox}>
        <div ref={contentRef} className={styles.lines} style={{ transform: `scale(${scale})` }}>
          {lines.map((line, li) => (
            <div key={li} className={styles.row}>
              <ClockLine ampm={li === 0 ? ampm : undefined} ampmClass={styles.ampm}>
                {line.split('').map((ch, i) => (
                  <ScrambleChar key={`${li}-${i}`} char={ch} />
                ))}
              </ClockLine>
            </div>
          ))}
        </div>
      </div>
      {dateStr && <ClockDate text={dateStr} className={styles.date} />}
    </div>
  );
}

export default MatrixClock;
