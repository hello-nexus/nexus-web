import { Fragment } from 'react';
import { useTranslation } from '../../../lib/i18n';
import { RangeBar } from '../../../components/common/RangeBar/RangeBar';
import { SectionHeader } from '../../../components/common/SectionHeader/SectionHeader';
import type { WeatherSnapshot } from '../../../api/weather';
import { WeatherIcon } from './WeatherIcon';
import { DAY_LABEL_KEYS, MIN_PRECIP_PCT, dailyMax, dailyMin, formatTemp, type WeatherUnit } from './weatherFormat';
import styles from './WeatherDailyList.module.scss';

export interface WeatherDailyListProps {
  snap: WeatherSnapshot | null;
  unit: WeatherUnit;
  immersive?: boolean;
}

// Every daily row the service sent (10 on a current service), each with its
// low/high placed on the period's overall range.
export function WeatherDailyList({ snap, unit, immersive }: WeatherDailyListProps) {
  const { t } = useTranslation();
  const days = (snap?.daily ?? []).filter(d => dailyMin(d, unit) !== null && dailyMax(d, unit) !== null);
  if (days.length === 0) return null;
  const lows = days.map(d => dailyMin(d, unit) as number);
  const highs = days.map(d => dailyMax(d, unit) as number);
  const min = Math.min(...lows);
  const max = Math.max(...highs);

  function dayLabel(date: string, index: number) {
    if (index === 0) return t('datepicker.today');
    const parsed = new Date(`${date}T12:00:00`);
    if (Number.isNaN(parsed.getTime())) return date.slice(5);
    return t(DAY_LABEL_KEYS[parsed.getDay()]) || date.slice(5);
  }

  return (
    <div className={`${styles.root} ${immersive ? styles.immersive : ''}`}>
      <SectionHeader className={styles.title}>{t('panel.widget.weather.daily', { days: days.length })}</SectionHeader>
      <div className={styles.list}>
        {days.map((d, i) => {
          const precip = d.precipitationProbabilityMaxPct ?? null;
          return (
            <Fragment key={d.date}>
              <span className={styles.day}>{dayLabel(d.date, i)}</span>
              <span className={styles.iconCell}>
                <WeatherIcon code={d.weatherCode} className={styles.icon} strokeWidth={1.6} />
                <span className={styles.precip}>{precip !== null && precip >= MIN_PRECIP_PCT ? `${Math.round(precip)}%` : ''}</span>
              </span>
              <span className={styles.lo}>{formatTemp(lows[i])}</span>
              <span className={styles.bar}><RangeBar lo={lows[i]} hi={highs[i]} min={min} max={max} height={immersive ? 8 : 6} /></span>
              <span className={styles.hi}>{formatTemp(highs[i])}</span>
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}
