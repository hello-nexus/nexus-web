import type { ClockDesignProps } from './types';
import { formatMetaLine } from './timeFormat';
import { ClockDate, ClockLine, useClockFit } from './layout';
import { StableDigits } from '../../common/StableDigits';
import styles from './DigitalClock.module.scss';

function DigitalClock({ now, tz, showSeconds, showDate, showTimezone, size, hour12, useAccentColor, layout }: ClockDesignProps) {
  const stacked = layout === 'stacked';
  const { boxRef, contentRef, scale } = useClockFit(stacked);
  const parts = new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: showSeconds ? '2-digit' : undefined,
    hour12,
    timeZone: tz || undefined,
  }).formatToParts(now);

  // The day period is lifted out of the locale's own string so it can render
  // small and dim beside the time instead of at full numeral size. Everything
  // else is joined back verbatim, keeping that locale's separators and digits.
  const dayPeriod = parts.find(p => p.type === 'dayPeriod')?.value ?? '';
  const lines = stacked
    ? parts.filter(p => p.type === 'hour' || p.type === 'minute' || p.type === 'second').map(p => p.value)
    : [parts.filter(p => p.type !== 'dayPeriod').map(p => p.value).join('').trim()];

  const dateStr = formatMetaLine(now, tz, showDate, showTimezone);

  const sizeClass = styles[`size-${size}`] ?? styles['size-4x2'];

  return (
    <div className={`${styles.container} ${sizeClass} ${stacked ? styles.stacked : ''} ${useAccentColor ? styles.accent : ''}`}>
      <div ref={boxRef} className={styles.fitBox}>
        <div ref={contentRef} className={styles.lines} style={{ transform: `scale(${scale})` }}>
          {lines.map((line, li) => (
            <div key={li} className={styles.time}>
              <ClockLine ampm={li === 0 ? dayPeriod : undefined} ampmClass={styles.ampm}>
                <StableDigits text={line} />
              </ClockLine>
            </div>
          ))}
        </div>
      </div>
      {dateStr && <ClockDate text={dateStr} className={styles.date} />}
    </div>
  );
}

export default DigitalClock;
