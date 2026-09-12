import type { ReactNode } from 'react';
import { Droplets, Eye, Gauge, Leaf, Sun, Sunrise, Thermometer, Umbrella, Wind } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { resolveHour12 } from '../../../lib/units';
import { useUnitPrefs } from '../../../hooks/useUiSettings';
import { Card } from '../../../components/common/Card/Card';
import type { WeatherSnapshot } from '../../../api/weather';
import {
  apparentTemp,
  aqiLevelKey,
  compassKey,
  currentTemp,
  dewPoint,
  formatClock,
  formatDistance,
  formatPrecip,
  formatSpeed,
  formatTemp,
  fraction,
  humidityLevelKey,
  localHourMinute,
  locationClock,
  minutesOfDay,
  uvLevelKey,
  visibilityLevelKey,
  type WeatherUnit,
} from './weatherFormat';
import styles from './WeatherDetailTiles.module.scss';

export interface WeatherDetailTilesProps {
  snap: WeatherSnapshot | null;
  unit: WeatherUnit;
  // Wall clock that places the sun on its arc.
  nowMs: number;
}

export type WeatherTileKey = 'aqi' | 'uv' | 'sun' | 'wind' | 'precip' | 'feels' | 'humidity' | 'visibility' | 'pressure';

export interface WeatherTile {
  key: WeatherTileKey;
  node: ReactNode;
}

function Tile({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <Card compact className={styles.tile} icon={icon} title={<span className={styles.tileTitle}>{title}</span>}>
      <div className={styles.tileBody}>{children}</div>
    </Card>
  );
}

// Horizontal scale with a marker: UV (0-11) and AQI (0-300+).
function ScaleBar({ value, max, gradient }: { value: number; max: number; gradient: 'uv' | 'aqi' }) {
  const pct = fraction(value, 0, max) * 100;
  return (
    <div className={`${styles.scale} ${gradient === 'uv' ? styles.scaleUv : styles.scaleAqi}`}>
      <span className={styles.scaleMarker} style={{ left: `${pct}%` }} />
    </div>
  );
}

// Sun position on a day arc: 0 at sunrise, 1 at sunset; outside daylight the
// sun sits just under the horizon line.
function SunArc({ progress }: { progress: number | null }) {
  const p = progress === null ? null : Math.max(-0.05, Math.min(1.05, progress));
  const angle = p === null ? null : Math.PI * (1 - p);
  const cx = angle === null ? null : 50 + 42 * Math.cos(angle);
  const cy = angle === null ? null : 46 - 38 * Math.sin(angle);
  return (
    <svg className={styles.sunArc} viewBox="0 0 100 52" aria-hidden="true">
      <path d="M 8 46 A 42 38 0 0 1 92 46" className={styles.sunArcTrack} />
      <line x1="2" y1="46" x2="98" y2="46" className={styles.sunHorizon} />
      {cx !== null && cy !== null && <circle cx={cx} cy={cy} r="4" className={styles.sunDot} />}
    </svg>
  );
}

// Compass rose; the needle points where the wind blows TO (direction + 180).
function WindCompass({ directionDeg, speed, unitLabel }: { directionDeg: number | null; speed: string | null; unitLabel: string }) {
  return (
    <svg className={styles.compass} viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r="44" className={styles.compassRing} />
      {[0, 90, 180, 270].map(a => {
        const r1 = 40;
        const r2 = 46;
        const rad = (a - 90) * Math.PI / 180;
        return <line key={a} x1={50 + r1 * Math.cos(rad)} y1={50 + r1 * Math.sin(rad)} x2={50 + r2 * Math.cos(rad)} y2={50 + r2 * Math.sin(rad)} className={styles.compassTick} />;
      })}
      {directionDeg !== null && (
        <g transform={`rotate(${directionDeg + 180} 50 50)`}>
          <polygon points="50,10 55,26 45,26" className={styles.compassNeedle} />
          <line x1="50" y1="26" x2="50" y2="78" className={styles.compassShaft} />
        </g>
      )}
      <text x="50" y="47" textAnchor="middle" className={styles.compassValue}>{speed ?? '--'}</text>
      <text x="50" y="60" textAnchor="middle" className={styles.compassUnit}>{unitLabel}</text>
    </svg>
  );
}

// Half-dial over the sea-level pressure band weather sits in (hPa).
const PRESSURE_MIN = 960;
const PRESSURE_MAX = 1060;

function PressureDial({ hpa }: { hpa: number }) {
  const angle = Math.PI * (1 - fraction(hpa, PRESSURE_MIN, PRESSURE_MAX));
  const x = 50 + 40 * Math.cos(angle);
  const y = 50 - 40 * Math.sin(angle);
  return (
    <svg className={styles.dial} viewBox="0 0 100 56" aria-hidden="true">
      <path d="M 10 50 A 40 40 0 0 1 90 50" className={styles.dialTrack} />
      <line x1="50" y1="50" x2={x} y2={y} className={styles.dialNeedle} />
      <circle cx="50" cy="50" r="3" className={styles.dialHub} />
    </svg>
  );
}

function feelsLikeHintKey(snap: WeatherSnapshot): string | null {
  const actual = snap.temperatureC;
  const feels = snap.apparentTemperatureC;
  if (actual === null || actual === undefined || feels === null || feels === undefined) return null;
  const delta = feels - actual;
  if (Math.abs(delta) < 1.5) return 'panel.widget.weather.feelsLike.similar';
  return delta < 0 ? 'panel.widget.weather.feelsLike.colderWind' : 'panel.widget.weather.feelsLike.warmerHumidity';
}

// Apple-Weather-style detail tiles: air quality, UV, sun, wind, precipitation,
// feels like, humidity, visibility and pressure. A tile whose reading the
// service did not send is left out rather than shown empty.
export function useWeatherDetailTiles(snap: WeatherSnapshot | null, unit: WeatherUnit, nowMs: number): WeatherTile[] {
  const { t } = useTranslation();
  const { timeFormat } = useUnitPrefs();
  if (!snap) return [];
  const hour12 = resolveHour12(timeFormat);
  const am = t('panel.widget.weather.am');
  const pm = t('panel.widget.weather.pm');
  const today = snap.daily?.[0];
  const tomorrow = snap.daily?.[1];

  const tiles: WeatherTile[] = [];
  const push = (key: WeatherTileKey, node: ReactNode) => tiles.push({ key, node });

  const aqi = snap.airQuality?.usAqi ?? null;
  const aqiKey = aqiLevelKey(aqi);
  if (aqi !== null && aqiKey) {
    push('aqi', (
      <Tile icon={<Leaf size={16} />} title={t('panel.widget.weather.airQuality')}>
        <div className={styles.big}>{aqi}</div>
        <div className={styles.sub}>{t(aqiKey)}</div>
        <ScaleBar value={aqi} max={300} gradient="aqi" />
      </Tile>
    ));
  }

  const uv = snap.uvIndex ?? null;
  const uvKey = uvLevelKey(uv);
  if (uv !== null && uvKey) {
    push('uv', (
      <Tile icon={<Sun size={16} />} title={t('panel.widget.weather.uvIndex')}>
        <div className={styles.big}>{Math.round(uv)}</div>
        <div className={styles.sub}>{t(uvKey)}</div>
        <ScaleBar value={uv} max={11} gradient="uv" />
      </Tile>
    ));
  }

  const rise = localHourMinute(today?.sunrise);
  const set = localHourMinute(today?.sunset);
  if (rise && set) {
    const clock = locationClock(snap, nowMs) ?? localHourMinute(snap.localTime);
    const nowMin = clock ? clock.hour * 60 + clock.minute : null;
    const riseMin = minutesOfDay(today?.sunrise) as number;
    const setMin = minutesOfDay(today?.sunset) as number;
    const progress = nowMin === null ? null : (nowMin - riseMin) / Math.max(1, setMin - riseMin);
    push('sun', (
      <Tile icon={<Sunrise size={16} />} title={t('panel.widget.weather.sunrise')}>
        <div className={styles.big}>{formatClock(rise.hour, rise.minute, hour12, am, pm)}</div>
        <SunArc progress={progress} />
        <div className={styles.sub}>{t('panel.widget.weather.sunsetAt', { time: formatClock(set.hour, set.minute, hour12, am, pm) })}</div>
      </Tile>
    ));
  }

  const speed = formatSpeed(snap.windKph, unit);
  if (speed) {
    const gust = formatSpeed(snap.windGustKph, unit);
    const dirKey = compassKey(snap.windDirectionDeg);
    push('wind', (
      <Tile icon={<Wind size={16} />} title={t('panel.widget.weather.wind')}>
        <div className={styles.windRow}>
          <WindCompass directionDeg={snap.windDirectionDeg ?? null} speed={speed.value} unitLabel={t(speed.unitKey)} />
          <div className={styles.windMeta}>
            {dirKey && <div className={styles.sub}>{t(dirKey)}</div>}
            {gust && <div className={styles.sub}>{t('panel.widget.weather.gusts', { value: `${gust.value} ${t(gust.unitKey)}` })}</div>}
          </div>
        </div>
      </Tile>
    ));
  }

  const precipToday = formatPrecip(today?.precipitationSumMm ?? snap.precipitationMm, unit);
  if (precipToday) {
    const precipTomorrow = formatPrecip(tomorrow?.precipitationSumMm, unit);
    const chance = today?.precipitationProbabilityMaxPct ?? null;
    push('precip', (
      <Tile icon={<Umbrella size={16} />} title={t('panel.widget.weather.precipitation')}>
        <div className={styles.big}>{precipToday.value} <span className={styles.bigUnit}>{t(precipToday.unitKey)}</span></div>
        <div className={styles.sub}>{t('panel.widget.weather.precipToday')}</div>
        {chance !== null && <div className={styles.sub}>{t('panel.widget.weather.precipChance', { pct: Math.round(chance) })}</div>}
        {precipTomorrow && (
          <div className={styles.sub}>{t('panel.widget.weather.precipTomorrow', { value: `${precipTomorrow.value} ${t(precipTomorrow.unitKey)}` })}</div>
        )}
      </Tile>
    ));
  }

  const feels = apparentTemp(snap, unit);
  if (feels !== null && feels !== undefined) {
    const hint = feelsLikeHintKey(snap);
    push('feels', (
      <Tile icon={<Thermometer size={16} />} title={t('panel.widget.weather.feelsLike')}>
        <div className={styles.big}>{formatTemp(feels)}</div>
        <div className={styles.sub}>{t('panel.widget.weather.actualTemp', { value: formatTemp(currentTemp(snap, unit)) })}</div>
        {hint && <div className={styles.sub}>{t(hint)}</div>}
      </Tile>
    ));
  }

  const humidity = snap.humidityPct;
  const humidityKey = humidityLevelKey(humidity);
  if (humidity !== null && humidity !== undefined && humidityKey) {
    const dew = dewPoint(snap, unit);
    push('humidity', (
      <Tile icon={<Droplets size={16} />} title={t('panel.widget.weather.humidity')}>
        <div className={styles.big}>{Math.round(humidity)}%</div>
        <div className={styles.sub}>{t(humidityKey)}</div>
        {dew !== null && dew !== undefined && <div className={styles.sub}>{t('panel.widget.weather.dewPoint', { value: formatTemp(dew) })}</div>}
      </Tile>
    ));
  }

  const visibility = formatDistance(snap.visibilityM, unit);
  const visibilityKey = visibilityLevelKey(snap.visibilityM);
  if (visibility && visibilityKey) {
    push('visibility', (
      <Tile icon={<Eye size={16} />} title={t('panel.widget.weather.visibility')}>
        <div className={styles.big}>{visibility.value} <span className={styles.bigUnit}>{t(visibility.unitKey)}</span></div>
        <div className={styles.sub}>{t(visibilityKey)}</div>
      </Tile>
    ));
  }

  const pressure = snap.pressureHpa;
  if (pressure !== null && pressure !== undefined) {
    const shown = unit === 'F'
      ? { value: (pressure * 0.02953).toFixed(2), unitKey: 'panel.widget.weather.unit.inhg' }
      : { value: String(Math.round(pressure)), unitKey: 'panel.widget.weather.unit.hpa' };
    push('pressure', (
      <Tile icon={<Gauge size={16} />} title={t('panel.widget.weather.pressure')}>
        <PressureDial hpa={pressure} />
        <div className={styles.big}>{shown.value} <span className={styles.bigUnit}>{t(shown.unitKey)}</span></div>
      </Tile>
    ));
  }

  return tiles;
}

// Desktop page: every tile in one auto-fill grid.
export function WeatherDetailTiles({ snap, unit, nowMs }: WeatherDetailTilesProps) {
  const tiles = useWeatherDetailTiles(snap, unit, nowMs);
  if (tiles.length === 0) return null;
  return <div className={styles.grid}>{tiles.map(tile => <div key={tile.key} className={styles.slot}>{tile.node}</div>)}</div>;
}

// Immersive cell: a fixed 2x2 that fills the cell without scrolling.
export function WeatherDetailTileCell({ tiles }: { tiles: WeatherTile[] }) {
  return <div className={styles.cellGrid}>{tiles.map(tile => <div key={tile.key} className={styles.slot}>{tile.node}</div>)}</div>;
}
