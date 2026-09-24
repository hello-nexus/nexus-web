import type { ReactNode } from 'react';
import { useTranslation } from '../../../lib/i18n';
import type { WeatherLocation } from '../../../api/weather';
import { ImmersiveLayout } from '../common/ImmersiveLayout';
import type { WidgetProps } from '../types';
import { WeatherDailyList } from './WeatherDailyList';
import { useWeatherDetailTiles, WeatherDetailTileCell } from './WeatherDetailTiles';
import { WeatherHero } from './WeatherHero';
import { WeatherHourlyStrip } from './WeatherHourlyStrip';
import { useWallClock } from './useWallClock';
import { useWeatherSnapshot } from './useWeatherSnapshot';
import { resolveUnit } from './weatherFormat';
import styles from './WeatherTouch.module.scss';

// The tile's own place, three 4x4 cells: conditions + hourly, the daily list,
// the detail tiles (feels-like left out, the hero carries it). Nothing scrolls
// inside a cell: one page on the Y70, two on a phone.
export function WeatherTouch({ widget, immersiveGrid }: WidgetProps) {
  const { t } = useTranslation();
  const location = (widget.config?.location as WeatherLocation | null | undefined) ?? null;
  const { snap, loaded } = useWeatherSnapshot(location);
  const unit = resolveUnit(widget.config?.unit as string | undefined, location?.cc ?? snap?.countryCode);
  const now = useWallClock();
  const tiles = useWeatherDetailTiles(snap, unit, now).filter(tile => tile.key !== 'feels');
  const label = location ? location.label : (snap?.locationLabel || t('panel.widget.weather.myLocation'));

  const cells: ReactNode[] = [
    <div key="hero" className={`${styles.cell} ${styles.grow}`}>
      <WeatherHero snap={snap} loaded={loaded} unit={unit} label={label} immersive />
      <WeatherHourlyStrip snap={snap} unit={unit} immersive />
    </div>,
    <div key="daily" className={`${styles.cell} ${styles.fill}`}>
      <WeatherDailyList snap={snap} unit={unit} immersive />
    </div>,
    <div key="details" className={`${styles.cell} ${styles.fill}`}>
      <WeatherDetailTileCell tiles={tiles} />
    </div>,
  ];

  return (
    <ImmersiveLayout
      cells={cells}
      gridColumns={immersiveGrid?.columns ?? 4}
      gridRows={immersiveGrid?.rows ?? 8}
    />
  );
}

export default WeatherTouch;
