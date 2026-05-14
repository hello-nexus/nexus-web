import { useEffect, useState, type CSSProperties } from 'react';
import {
  Sun, Cloud, CloudSun, CloudFog, CloudDrizzle, CloudRain,
  CloudSnow, CloudRainWind, CloudLightning, HelpCircle, Droplet, Wind,
} from 'lucide-react';
import { fetchService } from '../../api/service';
import type { WidgetProps } from '../../panel/widgets/types';
import styles from './LegacyWeatherWidget.module.scss';

interface WeatherSnapshot {
  temperatureC: number | null;
  temperatureF: number | null;
  weatherCode: number;
  condition: string;
  humidityPct: number | null;
  windKph: number | null;
  locationLabel: string;
  countryCode?: string;
  asOf: string;
  hourly?: WeatherHourlyForecast[];
  daily?: WeatherDailyForecast[];
}

const FAHRENHEIT_COUNTRIES = new Set(['US', 'BS', 'BZ', 'KY', 'LR', 'PW', 'FM', 'MH']);

function resolveUnit(setting: string | undefined, countryCode: string | undefined): 'C' | 'F' {
  if (setting === 'C' || setting === 'F') return setting;
  return countryCode && FAHRENHEIT_COUNTRIES.has(countryCode.toUpperCase()) ? 'F' : 'C';
}

interface WeatherHourlyForecast {
  time: string;
  weatherCode: number;
  temperatureC: number | null;
  temperatureF: number | null;
}

interface WeatherDailyForecast {
  date: string;
  weatherCode: number;
  temperatureMinC: number | null;
  temperatureMaxC: number | null;
  temperatureMinF: number | null;
  temperatureMaxF: number | null;
}

const REFRESH_MS = 15 * 60 * 1000;
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function WeatherIcon({
  code,
  className,
  strokeWidth,
}: {
  code: number | null | undefined;
  className: string;
  strokeWidth: number;
}) {
  if (code === null || code === undefined) return <HelpCircle className={className} strokeWidth={strokeWidth} />;
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

function formatTemp(value: number | null | undefined, fallback = '—') {
  return value === null || value === undefined ? fallback : `${Math.round(value)}°`;
}

function hourLabel(time: string) {
  const date = new Date(time);
  if (Number.isNaN(date.getTime())) {
    return time.split('T')[1]?.slice(0, 5) || '';
  }
  const hour = date.getHours();
  const suffix = hour >= 12 ? 'PM' : 'AM';
  return `${hour % 12 || 12}${suffix}`;
}

function dayLabel(date: string, index: number) {
  if (index === 0) return 'Today';
  const parsed = new Date(`${date}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return date.slice(5);
  return DAY_LABELS[parsed.getDay()] || date.slice(5);
}

function hourlyTemp(item: WeatherHourlyForecast, unit: 'C' | 'F') {
  return unit === 'F' ? item.temperatureF : item.temperatureC;
}

function dailyMin(item: WeatherDailyForecast, unit: 'C' | 'F') {
  return unit === 'F' ? item.temperatureMinF : item.temperatureMinC;
}

function dailyMax(item: WeatherDailyForecast, unit: 'C' | 'F') {
  return unit === 'F' ? item.temperatureMaxF : item.temperatureMaxC;
}

// Snapshot test variant: accepts an optional `mockSnap` to render with a
// fixed payload instead of hitting /api/weather. The test harness uses
// this to render the legacy widget alongside the declarative one with
// identical data so the diff is purely visual.
export function WeatherWidget({ widget, mockSnap, fixedNow }: WidgetProps & { mockSnap?: WeatherSnapshot; fixedNow?: number }) {
  const [snap, setSnap] = useState<WeatherSnapshot | null>(mockSnap ?? null);
  const [loaded, setLoaded] = useState(Boolean(mockSnap));
  const [referenceNow, setReferenceNow] = useState(fixedNow ?? 0);

  useEffect(() => {
    if (mockSnap) return; // harness mode - no fetch
    let cancelled = false;
    async function load() {
      const data = await fetchService<WeatherSnapshot>('/api/weather');
      if (!cancelled) {
        setReferenceNow(Date.now());
        setSnap(data);
        setLoaded(true);
      }
    }
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => { cancelled = true; clearInterval(t); };
  }, [mockSnap]);

  const unit = resolveUnit(widget.config?.unit?.s, snap?.countryCode);
  const showCondition = widget.config?.showCondition?.b ?? true;
  const showLocation = widget.config?.showLocation?.b ?? true;
  const showDetails = widget.config?.showDetails?.b ?? true;
  const tempValue = snap ? (unit === 'F' ? snap.temperatureF : snap.temperatureC) : null;
  const tempText = formatTemp(tempValue, loaded ? '—' : '…');

  const wide = widget.size === '4x2';
  const large = widget.size === '4x4';
  const compact = widget.size === '2x2';

  const now = referenceNow || 0;
  const hourlyItems = (snap?.hourly ?? [])
    .filter((item) => hourlyTemp(item, unit) !== null && hourlyTemp(item, unit) !== undefined)
    .filter((item) => {
      const t = new Date(item.time).getTime();
      return Number.isNaN(t) || t >= now - 60 * 60 * 1000;
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
          {showCondition && <span className={styles.largeDescription}>{snap?.condition || ''}</span>}
        </div>
        {todayMax !== null && todayMax !== undefined && todayMin !== null && todayMin !== undefined && (
          <span className={styles.largeHiLo}>H:{Math.round(todayMax)}° L:{Math.round(todayMin)}°</span>
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

  if (large) {
    return (
      <div className={styles.large}>
        {renderTop()}
        {renderHourly()}

        <div className={styles.divider} />
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
          }) : (
            <div className={styles.forecastEmpty}>{loaded ? 'No forecast' : 'Loading...'}</div>
          )}
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
          <WeatherIcon code={snap?.weatherCode} className={styles.compactIcon} strokeWidth={1.4} />
        </div>
        <div className={styles.compactReadout}>
          <div className={styles.compactTemp}>{tempText}</div>
          {compact && renderStats(styles.compactStats)}
        </div>
      </div>
      {showCondition && <div className={styles.compactCondition}>{snap?.condition || ''}</div>}
      {showLocation && <div className={styles.compactLocation}>{snap?.locationLabel || ''}</div>}
    </div>
  );
}

export default WeatherWidget;
