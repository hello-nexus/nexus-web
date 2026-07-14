// Live tile content for a 'weather' deck action - sibling of
// DeckMonitoringCell. The tile draws its own icon/temperature/city; the
// background is the standard --deck-accent DeckGrid already paints
// (slot.color, else DECK_MONITORING_TILE_BG - the same near-black default the
// monitoring tile uses, since this tile has no icon to color-code either).
import { useEffect, useState, type CSSProperties } from 'react';
import { fetchService } from '../../../api/service';
import { weatherLocationQuery } from '../../../api/weather';
import { usePanelPreview } from '../common/PanelPreviewContext';
import { WeatherIcon, formatTemp, resolveUnit } from '../weather/WeatherWidget';
import { resolveDeckTitleStyle, titleFontSizeCss } from './deckTitleStyle';
import type { DeckAction, DeckSlot } from './types';
import styles from './DeckWeatherCell.module.scss';

interface WeatherSnapshot {
  temperatureC: number | null;
  temperatureF: number | null;
  weatherCode: number;
  locationLabel: string;
  countryCode?: string;
}

const REFRESH_MS = 15 * 60 * 1000;

// Frozen fixture for the add-widget catalog preview + provider-less mounts,
// mirroring DeckMonitoringCell's PREVIEW_* constants.
const PREVIEW_TEMP_C = 22;
const PREVIEW_CITY = 'San Francisco';
const PREVIEW_WEATHER_CODE = 1;

export interface DeckWeatherCellProps {
  action: Extract<DeckAction, { type: 'weather' }>;
  title?: DeckSlot['title'];
}

export function DeckWeatherCell({ action, title }: DeckWeatherCellProps) {
  const preview = usePanelPreview();
  const [snap, setSnap] = useState<WeatherSnapshot | null>(null);

  const hasLocation = action.lat !== undefined && action.lon !== undefined;
  const query = hasLocation
    ? weatherLocationQuery({ lat: action.lat as number, lon: action.lon as number, label: action.city ?? '', cc: action.cc ?? '' })
    : '';

  useEffect(() => {
    if (preview) return;
    let cancelled = false;
    async function load() {
      const data = await fetchService<WeatherSnapshot>(`/api/weather${query}`);
      if (!cancelled) setSnap(data);
    }
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => { cancelled = true; clearInterval(timer); };
  }, [preview, query]);

  const unit = resolveUnit(action.units, snap?.countryCode);
  const tempValue = preview ? PREVIEW_TEMP_C : (unit === 'F' ? snap?.temperatureF : snap?.temperatureC);
  const tempText = formatTemp(tempValue);
  const cityText = preview ? PREVIEW_CITY : (action.city || snap?.locationLabel || '');
  const weatherCode = preview ? PREVIEW_WEATHER_CODE : snap?.weatherCode;

  const titleStyle = resolveDeckTitleStyle(title);
  const cityStyle: CSSProperties = {
    fontFamily: titleStyle.fontFamily || undefined,
    fontWeight: titleStyle.bold ? 700 : undefined,
    fontStyle: titleStyle.italic ? 'italic' : undefined,
    color: titleStyle.color,
    fontSize: titleFontSizeCss(titleStyle.size),
  };
  const tempStyle: CSSProperties = {
    fontFamily: titleStyle.fontFamily || undefined,
    color: titleStyle.color,
  };

  return (
    <div className={styles.tile}>
      <WeatherIcon code={weatherCode} className={styles.icon} strokeWidth={1.6} />
      <span className={styles.temp} style={tempStyle}>{tempText}</span>
      {cityText && <span className={styles.city} style={cityStyle}>{cityText}</span>}
    </div>
  );
}

export default DeckWeatherCell;
