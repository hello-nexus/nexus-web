import { useEffect, useRef, useState } from 'react';
import type { ClockDesignProps } from './types';
import { formatTime, getAmPm } from './timeFormat';
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
        // Clear the settling glow after a brief moment
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

function MatrixClock({ now, tz, showSeconds, showDate, size, hour12, useAccentColor }: ClockDesignProps) {
  const time = formatTime(now, tz, showSeconds, hour12);
  const ampm = getAmPm(now, tz, hour12);
  const chars = time.split('');
  const sizeClass = styles[`size-${size}`] ?? styles['size-4x2'];

  const dateStr = showDate ? new Intl.DateTimeFormat(undefined, {
    weekday: 'short', month: 'short', day: 'numeric',
    timeZone: tz || undefined,
  }).format(now) : '';

  return (
    <div className={`${styles.container} ${sizeClass} ${useAccentColor ? styles.accent : ''}`}>
      <div className={styles.row}>
        {chars.map((ch, i) => (
          <ScrambleChar key={i} char={ch} />
        ))}
        {ampm && <span className={styles.ampm}>{ampm}</span>}
      </div>
      {dateStr && <div className={styles.date}>{dateStr}</div>}
    </div>
  );
}

export default MatrixClock;
