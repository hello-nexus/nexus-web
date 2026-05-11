import { useEffect, useRef, useState } from 'react';
import type { ClockDesignProps } from './types';
import { formatTime, getAmPm } from './timeFormat';
import styles from './SplitFlapClock.module.scss';

const FLIP_DURATION_MS = 220;

function FlapCard({ char }: { char: string }) {
  const currentRef = useRef(char);
  const sequenceRef = useRef(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [state, setState] = useState({
    current: char,
    from: char,
    to: char,
    flipping: false,
    sequence: 0,
  });

  useEffect(() => {
    if (char === currentRef.current) return undefined;

    const from = currentRef.current;
    const to = char;
    const sequence = sequenceRef.current + 1;
    sequenceRef.current = sequence;

    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setState({ current: from, from, to, flipping: true, sequence });
    timeoutRef.current = setTimeout(() => {
      currentRef.current = to;
      setState({ current: to, from: to, to, flipping: false, sequence });
      timeoutRef.current = null;
    }, FLIP_DURATION_MS);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [char]);

  const isColon = char === ':';

  if (isColon) {
    return <div className={styles.colon}>:</div>;
  }

  const staticTop = state.flipping ? state.to : state.current;
  const staticBottom = state.flipping ? state.from : state.current;

  return (
    <div className={styles.card}>
      <div className={styles.cardTop}>
        <span>{staticTop}</span>
      </div>
      <div className={styles.divider} />
      <div className={styles.cardBottom}>
        <span>{staticBottom}</span>
      </div>
      {state.flipping && (
        <>
          <div key={`top-${state.sequence}`} className={styles.flapTop}>
            <span>{state.from}</span>
          </div>
          <div key={`bottom-${state.sequence}`} className={styles.flapBottom}>
            <span>{state.to}</span>
          </div>
        </>
      )}
    </div>
  );
}

function SplitFlapClock({ now, tz, showSeconds, showDate, size, hour12, useAccentColor }: ClockDesignProps) {
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
          <FlapCard key={i} char={ch} />
        ))}
        {ampm && <div className={styles.ampm}>{ampm}</div>}
      </div>
      {dateStr && <div className={styles.date}>{dateStr}</div>}
    </div>
  );
}

export default SplitFlapClock;
