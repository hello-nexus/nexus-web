import { type CSSProperties } from 'react';
import {
  Sun, Cloud, CloudSun, CloudFog, CloudDrizzle, CloudRain,
  CloudSnow, CloudRainWind, CloudLightning, HelpCircle, Droplet, Wind,
} from 'lucide-react';
import type { WidgetProps } from '../types';
import {
  WEATHER_PREVIEW,
  type WeatherDailyForecast,
  type WeatherHourlyForecast,
} from './weatherPreviewData';
import styles from './WeatherWidget.module.scss';

// Static catalog face for the Weather SDK app. Renders the original native
// weather layout from a fixed snapshot - no fetch, no config, no live clock -
// so the Add-a-Widget picker shows a real weather tile. The placed widget is
// still the SDK bundle; this only stands in for the picker preview.

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const unit: 'C' | 'F' = 'F';

function WeatherIcon({ code, className, strokeWidth }: { code: number; className: string; strokeWidth: number }) {
  if (code === 0 || code === 1) return <Sun className={className} strokeWidth={strokeWidth} />;
  if (code === 2) return <CloudSun className={className} strokeWidth={strokeWidth} />;
  if (code === 3) return <Cloud className={className} strokeWidth={strokeWidth} />;
  if (code === 45 || code === 48) return <CloudFog className={className} strokeWidth={strokeWidth} />;
  if (code >= 51 && code <= 57) return <CloudDrizzle className={className} strokeWidth={strokeWidth} />;
  if (code >= 61 && code <= 67) return <CloudRain className={className} strokeWidth={strokeWidth} />;
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return <CloudSnow className={className} strokeWidth={strokeWidth} />;
  if (code >= 80 && code <= 82) return <CloudRainWind className={className} strokeWidth={strokeWidth} />;
  if (code >= 95 && code <= 99) return <CloudLightning className={className} strokeWidth={strokeWidth} />;
  return <HelpCircle className={className} strokeWidth={strokeWidth} />;
}

function formatTemp(value: number | null | undefined) {
  return value === null || value === undefined ? '-' : `${Math.round(value)}°`;
}

function hourLabel(time: string) {
  const date = new Date(time);
  if (Number.isNaN(date.getTime())) return time.split('T')[1]?.slice(0, 5) || '';
  const hour = date.getHours();
  return `${hour % 12 || 12}${hour >= 12 ? 'PM' : 'AM'}`;
}

function dayLabel(date: string, index: number) {
  if (index === 0) return 'Today';
  const parsed = new Date(`${date}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? date.slice(5) : (DAY_LABELS[parsed.getDay()] || date.slice(5));
}

function hourlyTemp(item: WeatherHourlyForecast) {
  return unit === 'F' ? item.temperatureF : item.temperatureC;
}

function dailyMin(item: WeatherDailyForecast) {
  return unit === 'F' ? item.temperatureMinF : item.temperatureMinC;
}

function dailyMax(item: WeatherDailyForecast) {
  return unit === 'F' ? item.temperatureMaxF : item.temperatureMaxC;
}

export function WeatherPreview({ widget }: WidgetProps) {
  const snap = WEATHER_PREVIEW;
  const tempText = formatTemp(unit === 'F' ? snap.temperatureF : snap.temperatureC);

  const wide = widget.size === '4x2';
  const large = widget.size === '4x4';
  const compact = widget.size === '2x2';

  const hourlyItems = (snap.hourly ?? []).slice(0, 6);
  const dailyItems = (snap.daily ?? []).slice(0, 5);
  const todayMin = dailyItems[0] ? dailyMin(dailyItems[0]) : null;
  const todayMax = dailyItems[0] ? dailyMax(dailyItems[0]) : null;
  const hiLoText = todayMax !== null && todayMin !== null
    ? `H:${Math.round(todayMax)}° L:${Math.round(todayMin)}°`
    : null;
  const lows = dailyItems.map(dailyMin).filter((v): v is number => v !== null);
  const highs = dailyItems.map(dailyMax).filter((v): v is number => v !== null);
  const weekMin = lows.length > 0 ? Math.min(...lows) : 0;
  const weekMax = highs.length > 0 ? Math.max(...highs) : 1;
  const weekRange = weekMax - weekMin || 1;

  const renderStats = (className: string) => (
    <div className={className}>
      <span className={styles.stat}><Droplet strokeWidth={1.7} /> {Math.round(snap.humidityPct ?? 0)}%</span>
      <span className={styles.stat}><Wind strokeWidth={1.7} /> {Math.round(snap.windKph ?? 0)}</span>
    </div>
  );

  const renderTop = () => (
    <div className={styles.largeTop}>
      <div className={styles.largeCurrent}>
        <div className={styles.largeTemp}>{tempText}</div>
        {renderStats(styles.largeCurrentStats)}
      </div>
      <div className={styles.largeMeta}>
        <div className={styles.largeDescRow}>
          <WeatherIcon code={snap.weatherCode} className={styles.largeIcon} strokeWidth={1.5} />
          <span className={styles.largeDescription}>{snap.condition}</span>
        </div>
        {hiLoText && <span className={styles.largeHiLo}>{hiLoText}</span>}
        <span className={styles.largeLocation}>{snap.locationLabel}</span>
      </div>
    </div>
  );

  const renderHourly = () => (
    <div className={styles.hourlyRow}>
      {hourlyItems.map((item, index) => (
        <div key={`${item.time}-${index}`} className={styles.hourlyItem}>
          <span className={styles.hourlyLabel}>{hourLabel(item.time)}</span>
          <WeatherIcon code={item.weatherCode} className={styles.hourlyIcon} strokeWidth={1.5} />
          <span className={styles.hourlyTemp}>{formatTemp(hourlyTemp(item))}</span>
        </div>
      ))}
    </div>
  );

  if (large) {
    return (
      <div className={styles.large}>
        {renderTop()}
        {renderHourly()}
        <div className={styles.divider} />
        <div className={styles.dailyList}>
          {dailyItems.map((item, index) => {
            const min = dailyMin(item) ?? weekMin;
            const max = dailyMax(item) ?? weekMax;
            const barLeft = Math.max(0, Math.min(100, ((min - weekMin) / weekRange) * 100));
            const barRight = Math.max(0, Math.min(100, ((weekMax - max) / weekRange) * 100));
            const barStyle = {
              '--weather-bar-left': `${barLeft}%`,
              '--weather-bar-right': `${barRight}%`,
            } as CSSProperties;
            return (
              <div key={`${item.date}-${index}`} className={styles.dailyRow}>
                <span className={styles.dailyDay}>{dayLabel(item.date, index)}</span>
                <div className={styles.dailyIcon}>
                  <WeatherIcon code={item.weatherCode} className={styles.dailyIconSvg} strokeWidth={1.6} />
                </div>
                <span className={styles.dailyLo}>{formatTemp(min)}</span>
                <div className={styles.dailyBarTrack}>
                  <div className={styles.dailyBarFill} style={barStyle} />
                </div>
                <span className={styles.dailyHi}>{formatTemp(max)}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (wide) {
    return (
      <div className={`${styles.large} ${styles.wideForecast}`}>
        {renderTop()}
        {renderHourly()}
      </div>
    );
  }

  return (
    <div className={`${styles.compact} ${compact ? styles.compact2x2 : styles.compact1x1}`}>
      <div className={styles.compactCurrent}>
        <div className={styles.compactIconWrap}>
          <WeatherIcon code={snap.weatherCode} className={styles.compactIcon} strokeWidth={1.4} />
        </div>
        <div className={styles.compactReadout}>
          <div className={styles.compactTemp}>{tempText}</div>
          {compact && renderStats(styles.compactStats)}
        </div>
      </div>
      <div className={styles.compactCondition}>{snap.condition}</div>
      <div className={styles.compactLocation}>{snap.locationLabel}</div>
    </div>
  );
}

export default WeatherPreview;
