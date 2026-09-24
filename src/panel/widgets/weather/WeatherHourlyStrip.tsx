import { useTranslation } from '../../../lib/i18n';
import { resolveHour12 } from '../../../lib/units';
import { useUnitPrefs } from '../../../hooks/useUiSettings';
import type { WeatherSnapshot } from '../../../api/weather';
import { formatWeatherHour } from './weatherConditions';
import { WeatherIcon } from './WeatherIcon';
import { MIN_PRECIP_PCT, formatTemp, hourlyTemp, upcomingHours, type WeatherUnit } from './weatherFormat';
import { Card } from '../../../components/common/Card/Card';
import { SectionHeader } from '../../../components/common/SectionHeader/SectionHeader';
import styles from './WeatherHourlyStrip.module.scss';

const HOURS = 24;
// Immersive cells never scroll, so the strip shows only what a 4x4 fits.
const IMMERSIVE_HOURS = 8;

export interface WeatherHourlyStripProps {
  snap: WeatherSnapshot | null;
  unit: WeatherUnit;
  immersive?: boolean;
}

// Next 24 hours as a horizontally scrolling column strip, with a faint
// temperature area behind the readouts.
export function WeatherHourlyStrip({ snap, unit, immersive }: WeatherHourlyStripProps) {
  const { t } = useTranslation();
  const { timeFormat } = useUnitPrefs();
  const hour12 = resolveHour12(timeFormat);
  const hours = upcomingHours(snap, immersive ? IMMERSIVE_HOURS : HOURS)
    .filter(h => hourlyTemp(h, unit) !== null && hourlyTemp(h, unit) !== undefined);
  if (hours.length === 0) return null;

  const temps = hours.map(h => hourlyTemp(h, unit) as number);
  const min = Math.min(...temps);
  const max = Math.max(...temps);
  const span = max - min || 1;
  // Area under the temperature curve in a 0..100 x 0..100 box, one point per
  // column centre, closed along the bottom edge.
  const curve = temps.map((v, i) => {
    const x = ((i + 0.5) / hours.length) * 100;
    const y = 85 - ((v - min) / span) * 60;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  const area = [`0,${curve[0].split(',')[1]}`, ...curve, `100,${curve[curve.length - 1].split(',')[1]}`, '100,100', '0,100'].join(' ');

  return (
    <div className={`${styles.root} ${immersive ? styles.immersive : ''}`}>
      <SectionHeader className={styles.title}>{t('panel.widget.weather.hourly')}</SectionHeader>
      <Card compact className={styles.scroller}>
        <div className={styles.strip} style={immersive ? undefined : { minWidth: `${hours.length * 3.5}rem` }} data-panel-scrollable="true">
          <svg className={styles.curve} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <polygon points={area} />
          </svg>
          {hours.map((h, i) => {
            const precip = h.precipitationProbabilityPct ?? null;
            return (
              <div key={h.time} className={styles.column}>
                <span className={styles.hour}>
                  {i === 0 ? t('panel.widget.weather.now') : formatWeatherHour(h.time, hour12, t('panel.widget.weather.am'), t('panel.widget.weather.pm'))}
                </span>
                <WeatherIcon code={h.weatherCode} isDay={h.isDay} className={styles.icon} strokeWidth={1.6} />
                <span className={styles.precip}>{precip !== null && precip >= MIN_PRECIP_PCT ? `${Math.round(precip)}%` : ''}</span>
                <span className={styles.temp}>{formatTemp(hourlyTemp(h, unit))}</span>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
