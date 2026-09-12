import { Fragment, type CSSProperties } from 'react';
import { widgetLayoutSize } from '../../types';
import { Droplet, Wind } from 'lucide-react';
import { type WeatherLocation } from '../../../api/weather';
import { useTranslation } from '../../../lib/i18n';
import { resolveHour12 } from '../../../lib/units';
import { useUnitPrefs } from '../../../hooks/useUiSettings';
import type { WidgetProps } from '../types';
import { formatWeatherHour, weatherConditionKey } from './weatherConditions';
import { WeatherIcon } from './WeatherIcon';
import { DAY_LABEL_KEYS, dailyMax, dailyMin, formatTemp, hourlyTemp, resolveUnit, upcomingHours } from './weatherFormat';
import { useWeatherSnapshot } from './useWeatherSnapshot';
import styles from './WeatherWidget.module.scss';

// Deck cells import the tile's glyph + formatting through here.
export { WeatherIcon, formatTemp, resolveUnit };

export function WeatherWidget({ widget }: WidgetProps) {
  const { t } = useTranslation();
  const { timeFormat } = useUnitPrefs();
  const location = (widget.config?.location as WeatherLocation | null | undefined) ?? null;
  const { snap, loaded, fetchedAt: referenceNow } = useWeatherSnapshot(location);

  const hour12 = resolveHour12(timeFormat);
  function hourLabel(time: string) {
    return formatWeatherHour(
      time, hour12, t('panel.widget.weather.am'), t('panel.widget.weather.pm'));
  }

  function dayLabel(date: string, index: number) {
    if (index === 0) return t('datepicker.today');
    const parsed = new Date(`${date}T12:00:00`);
    if (Number.isNaN(parsed.getTime())) return date.slice(5);
    return t(DAY_LABEL_KEYS[parsed.getDay()]) || date.slice(5);
  }

  const unit = resolveUnit(widget.config?.unit as string | undefined, snap?.countryCode);
  const showCondition = (widget.config?.showCondition as boolean | undefined) ?? true;
  const showLocation = (widget.config?.showLocation as boolean | undefined) ?? true;
  const showDetails = (widget.config?.showDetails as boolean | undefined) ?? true;
  const tempValue = snap ? (unit === 'F' ? snap.temperatureF : snap.temperatureC) : null;
  const conditionKey = weatherConditionKey(snap?.weatherCode);
  const conditionText = conditionKey ? t(conditionKey) : (snap?.condition || '');
  const tempText = formatTemp(tempValue, loaded ? '--' : '…');

  const size = widgetLayoutSize(widget.size);
  const wide = size === '4x2';
  const large = size === '4x4';
  const compact = size === '2x2';
  const portrait = size === '2x4';

  const now = referenceNow || 0;
  // With the provider's local reading time the strip starts at the
  // location's current hour; without it (older service) the rows are read as
  // browser-local and filtered against the fetch clock.
  const hourlyItems = (snap?.localTime ? upcomingHours(snap, 48) : (snap?.hourly ?? []))
    .filter((item) => hourlyTemp(item, unit) !== null && hourlyTemp(item, unit) !== undefined)
    .filter((item) => {
      if (snap?.localTime) return true;
      const t2 = new Date(item.time).getTime();
      return Number.isNaN(t2) || t2 >= now - 60 * 60 * 1000;
    })
    .slice(0, 6);
  const dailyItems = (snap?.daily ?? [])
    .filter((item) => dailyMin(item, unit) !== null && dailyMax(item, unit) !== null)
    .slice(0, 5);
  const todayMin = dailyItems[0] ? dailyMin(dailyItems[0], unit) : null;
  const todayMax = dailyItems[0] ? dailyMax(dailyItems[0], unit) : null;
  const lows = dailyItems.map((item) => dailyMin(item, unit)).filter((value): value is number => value !== null && value !== undefined);
  const highs = dailyItems.map((item) => dailyMax(item, unit)).filter((value): value is number => value !== null && value !== undefined);
  const weekMin = lows.length > 0 ? Math.min(...lows) : 0;
  const weekMax = highs.length > 0 ? Math.max(...highs) : 1;
  const weekRange = weekMax - weekMin || 1;

  const renderStats = (className: string) => {
    if (!showDetails || (snap?.humidityPct == null && snap?.windKph == null)) return null;
    return (
      <div className={className}>
        {snap?.humidityPct != null && (
          <span className={styles.stat}><Droplet strokeWidth={1.7} /> {Math.round(snap.humidityPct)}%</span>
        )}
        {snap?.windKph != null && (
          <span className={styles.stat}><Wind strokeWidth={1.7} /> {Math.round(snap.windKph)}</span>
        )}
      </div>
    );
  };

  const renderTop = () => (
    <div className={styles.largeTop}>
      <div className={styles.largeCurrent}>
        <div className={styles.largeTemp}>{tempText}</div>
        {renderStats(styles.largeCurrentStats)}
      </div>
      <div className={styles.largeMeta}>
        <div className={styles.largeDescRow}>
          <WeatherIcon code={snap?.weatherCode} className={styles.largeIcon} strokeWidth={1.5} />
          {showCondition && <span className={styles.largeDescription}>{conditionText}</span>}
        </div>
        {todayMax !== null && todayMax !== undefined && todayMin !== null && todayMin !== undefined && (
          <span className={styles.largeHiLo}>
            {t('panel.widget.weather.hiLo', { hi: Math.round(todayMax), lo: Math.round(todayMin) })}
          </span>
        )}
        {showLocation && <span className={styles.largeLocation}>{snap?.locationLabel || ''}</span>}
      </div>
    </div>
  );

  const renderHourly = () => {
    if (hourlyItems.length === 0) return null;
    return (
      <div className={styles.hourlyRow}>
        {hourlyItems.map((item, index) => {
          return (
            <div key={`${item.time}-${index}`} className={styles.hourlyItem}>
              <span className={styles.hourlyLabel}>{hourLabel(item.time)}</span>
              <WeatherIcon code={item.weatherCode} className={styles.hourlyIcon} strokeWidth={1.5} />
              <span className={styles.hourlyTemp}>{formatTemp(hourlyTemp(item, unit))}</span>
            </div>
          );
        })}
      </div>
    );
  };

  // 4x4 shows a per-day range bar; 2x4 drops the bar and leaves the column
  // empty so the low/high stay aligned to the same columns.
  const renderDailyList = (showBars: boolean) => (
    <div className={styles.dailyList}>
      {dailyItems.length > 0 ? dailyItems.map((item, index) => {
        const min = dailyMin(item, unit) ?? weekMin;
        const max = dailyMax(item, unit) ?? weekMax;
        const barLeft = Math.max(0, Math.min(100, ((min - weekMin) / weekRange) * 100));
        const barRight = Math.max(0, Math.min(100, ((weekMax - max) / weekRange) * 100));
        const barStyle = {
          '--weather-bar-left': `${barLeft}%`,
          '--weather-bar-right': `${barRight}%`,
        } as CSSProperties;
        return (
          <Fragment key={`${item.date}-${index}`}>
            <span className={styles.dailyDay}>{dayLabel(item.date, index)}</span>
            <div className={styles.dailyIcon}>
              <WeatherIcon code={item.weatherCode} className={styles.dailyIconSvg} strokeWidth={1.6} />
            </div>
            <span className={styles.dailyLo}>{formatTemp(min)}</span>
            {showBars ? (
              <div className={styles.dailyBarTrack}>
                <div className={styles.dailyBarFill} style={barStyle} />
              </div>
            ) : (
              <span className={styles.dailySpacer} />
            )}
            <span className={styles.dailyHi}>{formatTemp(max)}</span>
          </Fragment>
        );
      }) : (
        <div className={styles.forecastEmpty}>{loaded ? t('panel.widget.weather.noForecast') : t('common.loading')}</div>
      )}
    </div>
  );

  const renderCurrentBlock = (sizeClass: string, showStats: boolean) => (
    <div className={`${styles.compact} ${sizeClass}`}>
      <div className={styles.compactCurrent}>
        <div className={styles.compactIconWrap}>
          <WeatherIcon code={snap?.weatherCode} className={styles.compactIcon} strokeWidth={1.4} />
        </div>
        <div className={styles.compactReadout}>
          <div className={styles.compactTemp}>{tempText}</div>
        </div>
      </div>
      {showStats && renderStats(styles.compactStats)}
      {showCondition && <div className={styles.compactCondition}>{conditionText}</div>}
      {showLocation && <div className={styles.compactLocation}>{snap?.locationLabel || ''}</div>}
    </div>
  );

  if (large) {
    return (
      <div className={`${styles.large} ${styles.largeTall}`}>
        <div className={styles.topSection}>
          {renderTop()}
          {renderHourly()}
        </div>

        <div className={styles.divider} />
        {renderDailyList(true)}
      </div>
    );
  }

  if (wide) {
    return (
      <div className={`${styles.large} ${styles.largeWide}`}>
        <div className={styles.topSection}>
          {renderTop()}
          {renderHourly()}
        </div>
      </div>
    );
  }

  if (portrait) {
    return (
      <div className={styles.portrait}>
        {renderCurrentBlock(`${styles.compact2x2} ${styles.portraitCurrent}`, true)}
        <div className={styles.divider} />
        {renderDailyList(false)}
      </div>
    );
  }

  return renderCurrentBlock(compact ? styles.compact2x2 : styles.compact1x1, compact);
}

export default WeatherWidget;
