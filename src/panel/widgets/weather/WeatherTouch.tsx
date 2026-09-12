import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from '../../../lib/i18n';
import { canEditFreeText } from '../../types';
import type { WeatherLocation } from '../../../api/weather';
import { ImmersiveLayout } from '../common/ImmersiveLayout';
import type { WidgetProps } from '../types';
import { WeatherDailyList } from './WeatherDailyList';
import { useWeatherDetailTiles, WeatherDetailTileCell, type WeatherTile } from './WeatherDetailTiles';
import { WeatherHero } from './WeatherHero';
import { WeatherHourlyStrip } from './WeatherHourlyStrip';
import { buildPlaces, placeKey, WeatherLocationList } from './WeatherLocationList';
import { useWallClock } from './useWallClock';
import { useWeatherPrefs } from './useWeatherPrefs';
import { useWeatherSnapshot } from './useWeatherSnapshot';
import { resolveUnit } from './weatherFormat';
import styles from './WeatherTouch.module.scss';

// Tiles per immersive cell (a 2x2 grid). The feels-like tile is left out here
// because the hero already carries that reading.
const TILES_PER_CELL = 4;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// One 4x4 cell each: conditions + hourly, place switcher, daily list, then the
// detail tiles four at a time. Nothing scrolls inside a cell (more content =
// more pages), and the place switch is view-local: the tile keeps its own.
export function WeatherTouch({ widget, surface, immersiveGrid }: WidgetProps) {
  const { t } = useTranslation();
  const { prefs, addLocation, removeLocation } = useWeatherPrefs();
  const configured = (widget.config?.location as WeatherLocation | null | undefined) ?? null;
  const places = useMemo(() => {
    const base = buildPlaces(prefs.locations);
    // The tile's own pick may predate the shared list; keep it selectable.
    return configured && !base.some(p => p.key === placeKey(configured))
      ? [...base, { key: placeKey(configured), location: configured }]
      : base;
  }, [prefs.locations, configured]);
  const [selectedKey, setSelectedKey] = useState(() => placeKey(configured));
  const selected = places.find(p => p.key === selectedKey) ?? places[0];
  const { snap, loaded } = useWeatherSnapshot(selected.location);
  const unit = resolveUnit(widget.config?.unit as string | undefined, selected.location?.cc ?? snap?.countryCode);
  const now = useWallClock();
  const tiles: WeatherTile[] = useWeatherDetailTiles(snap, unit, now).filter(tile => tile.key !== 'feels');

  useEffect(() => {
    if (!places.some(p => p.key === selectedKey)) setSelectedKey(places[0].key);
  }, [places, selectedKey]);

  const label = selected.location ? selected.location.label : (snap?.locationLabel || t('panel.widget.weather.myLocation'));

  const cells: ReactNode[] = [
    <div key="hero" className={`${styles.cell} ${styles.grow}`}>
      <WeatherHero snap={snap} loaded={loaded} unit={unit} label={label} immersive />
      <WeatherHourlyStrip snap={snap} unit={unit} immersive />
    </div>,
    <div key="places" className={`${styles.cell} ${styles.fill}`}>
      <WeatherLocationList
        places={places}
        selectedKey={selected.key}
        onSelect={setSelectedKey}
        onAdd={addLocation}
        onRemove={removeLocation}
        unitPref={prefs.unit}
        canSearch={canEditFreeText(surface)}
        immersive
        nowMs={now}
      />
    </div>,
    <div key="daily" className={`${styles.cell} ${styles.fill}`}>
      <WeatherDailyList snap={snap} unit={unit} immersive />
    </div>,
    ...chunk(tiles, TILES_PER_CELL).map((group, i) => (
      <div key={`tiles-${i}`} className={`${styles.cell} ${styles.fill}`}>
        <WeatherDetailTileCell tiles={group} />
      </div>
    )),
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
