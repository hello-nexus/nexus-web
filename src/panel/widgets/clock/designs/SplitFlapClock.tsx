import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { ClockDesignProps } from './types';
import { formatMetaLine, formatTime, getAmPm } from './timeFormat';
import { ClockDate, splitTimeLines, useClockFit } from './layout';
import styles from './SplitFlapClock.module.scss';

const FLIP_DURATION_MS = 220;

function FlapCard({ char, badge }: { char: string; badge?: ReactNode }) {
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

  const card = (
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

  // The badge rides a wrapper, not the card: the card is a 3D rendering
  // context, where the flipping halves sort by their position in space and can
  // sweep over a child no matter its z-index.
  if (!badge) return card;

  return (
    <div className={styles.cardWrap}>
      {card}
      {badge}
    </div>
  );
}

function SplitFlapClock({ now, tz, showSeconds, showDate, showTimezone, dateFormat, size, hour12, useAccentColor, layout }: ClockDesignProps) {
  const time = formatTime(now, tz, showSeconds, hour12);
  const ampm = getAmPm(now, tz, hour12);
  const stacked = layout === 'stacked';
  const lines = splitTimeLines(time, layout);
  const { boxRef, contentRef, scale } = useClockFit(stacked);
  const sizeClass = styles[`size-${size}`] ?? styles['size-4x2'];

  const dateStr = formatMetaLine(now, tz, showDate, showTimezone, dateFormat);

  // AM/PM rides the last hour digit: the char before the first colon on a
  // horizontal line, the last char of the hour line when stacked.
  const firstColon = lines[0].indexOf(':');
  const hourEnd = firstColon === -1 ? lines[0].length - 1 : firstColon - 1;
  const badge = ampm ? <span className={styles.ampm}>{ampm}</span> : undefined;

  return (
    <div className={`${styles.container} ${sizeClass} ${stacked ? styles.stacked : ''} ${useAccentColor ? styles.accent : ''}`}>
      <div ref={boxRef} className={styles.fitBox}>
        <div ref={contentRef} className={styles.lines} style={{ transform: `scale(${scale})` }}>
          {lines.map((line, li) => (
            <div key={li} className={styles.row}>
              {line.split('').map((ch, i) => (
                <FlapCard
                  key={`${li}-${i}`}
                  char={ch}
                  badge={li === 0 && i === hourEnd ? badge : undefined}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      {dateStr && <ClockDate text={dateStr} className={styles.date} />}
    </div>
  );
}

export default SplitFlapClock;
