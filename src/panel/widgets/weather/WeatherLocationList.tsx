import { X } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { resolveHour12 } from '../../../lib/units';
import { useUnitPrefs } from '../../../hooks/useUiSettings';
import { DesktopOnlyBadge } from '../../../components/common/DesktopOnlyBadge/DesktopOnlyBadge';
import { SectionHeader } from '../../../components/common/SectionHeader/SectionHeader';
import { geocodeResultToLocation, weatherLocationKey, type WeatherGeocodeResult, type WeatherLocation, type WeatherUnitPref } from '../../../api/weather';
import { weatherConditionKey } from './weatherConditions';
import { WeatherIcon } from './WeatherIcon';
import { WeatherLocationSearch } from './WeatherLocationSearch';
import { useWeatherSnapshot } from './useWeatherSnapshot';
import { currentTemp, dailyMax, dailyMin, formatClock, formatTemp, locationClock, resolveUnit } from './weatherFormat';
import styles from './WeatherLocationList.module.scss';

// One selectable entry: null location = the auto (IP-geolocated) place.
export interface WeatherPlace {
  key: string;
  location: WeatherLocation | null;
}

export const AUTO_PLACE_KEY = 'auto';

export function placeKey(location: WeatherLocation | null): string {
  return location ? weatherLocationKey(location) : AUTO_PLACE_KEY;
}

export function buildPlaces(locations: WeatherLocation[]): WeatherPlace[] {
  return [{ key: AUTO_PLACE_KEY, location: null }, ...locations.map(l => ({ key: placeKey(l), location: l }))];
}

export interface WeatherLocationListProps {
  places: WeatherPlace[];
  selectedKey: string;
  onSelect: (key: string) => void;
  onAdd: (location: WeatherLocation) => void;
  onRemove: (location: WeatherLocation) => void;
  unitPref: WeatherUnitPref;
  // False on a keyboard-less surface: the search is replaced by a badge.
  canSearch: boolean;
  immersive?: boolean;
  nowMs: number;
}

// Saved places as Apple-style rows (name, local time, condition, temperature,
// high/low) with a search box to add more. Each row fetches its own snapshot
// through the shared cache.
export function WeatherLocationList({
  places, selectedKey, onSelect, onAdd, onRemove, unitPref, canSearch, immersive, nowMs,
}: WeatherLocationListProps) {
  const { t } = useTranslation();

  function handleResult(result: WeatherGeocodeResult) {
    const location = geocodeResultToLocation(result);
    onAdd(location);
    onSelect(placeKey(location));
  }

  return (
    <div className={`${styles.root} ${immersive ? styles.immersive : ''}`}>
      <SectionHeader className={styles.title}>{t('panel.widget.weather.locations')}</SectionHeader>
      {canSearch ? (
        <div className={styles.search}>
          <WeatherLocationSearch hasKeyboard onSelect={handleResult} />
        </div>
      ) : (
        <div className={styles.search}><DesktopOnlyBadge /></div>
      )}
      <div className={styles.list} role="listbox" aria-label={t('panel.widget.weather.locations')} data-panel-scrollable="true">
        {places.map(place => (
          <WeatherPlaceRow
            key={place.key}
            place={place}
            selected={place.key === selectedKey}
            onSelect={() => onSelect(place.key)}
            onRemove={place.location ? () => onRemove(place.location as WeatherLocation) : undefined}
            unitPref={unitPref}
            nowMs={nowMs}
          />
        ))}
      </div>
    </div>
  );
}

function WeatherPlaceRow({
  place, selected, onSelect, onRemove, unitPref, nowMs,
}: {
  place: WeatherPlace;
  selected: boolean;
  onSelect: () => void;
  onRemove?: () => void;
  unitPref: WeatherUnitPref;
  nowMs: number;
}) {
  const { t } = useTranslation();
  const { timeFormat } = useUnitPrefs();
  const { snap, loaded } = useWeatherSnapshot(place.location);
  const unit = resolveUnit(unitPref, place.location?.cc ?? snap?.countryCode);
  const conditionKey = weatherConditionKey(snap?.weatherCode);
  const conditionText = conditionKey ? t(conditionKey) : (snap?.condition || '');
  const today = snap?.daily?.[0];
  const hi = today ? dailyMax(today, unit) : null;
  const lo = today ? dailyMin(today, unit) : null;
  const clock = locationClock(snap, nowMs);
  const label = place.location ? place.location.label : t('panel.widget.weather.myLocation');
  const subline = place.location ? (snap?.locationLabel && snap.locationLabel !== place.location.label ? snap.locationLabel : '') : (snap?.locationLabel ?? '');

  return (
    <div className={`${styles.row} ${selected ? styles.rowSelected : ''}`}>
      <button
        type="button"
        className={styles.rowSelect}
        role="option"
        aria-selected={selected}
        onClick={onSelect}
      >
      <div className={styles.rowMain}>
        <div className={styles.rowName}>{label}</div>
        <div className={styles.rowMeta}>
          {clock && <span>{formatClock(clock.hour, clock.minute, resolveHour12(timeFormat), t('panel.widget.weather.am'), t('panel.widget.weather.pm'))}</span>}
          {subline && <span>{subline}</span>}
        </div>
        <div className={styles.rowCondition}>
          <WeatherIcon code={snap?.weatherCode} isDay={snap?.isDay} className={styles.rowIcon} strokeWidth={1.6} />
          <span>{loaded && !snap ? t('panel.widget.weather.noData') : conditionText}</span>
        </div>
      </div>
      <div className={styles.rowSide}>
        <div className={styles.rowTemp}>{formatTemp(currentTemp(snap, unit), loaded ? '--' : '…')}</div>
        {hi !== null && hi !== undefined && lo !== null && lo !== undefined && (
          <div className={styles.rowHiLo}>{t('panel.widget.weather.hiLo', { hi: Math.round(hi), lo: Math.round(lo) })}</div>
        )}
      </div>
      </button>
      {onRemove && (
        <button
          type="button"
          className={styles.remove}
          aria-label={t('panel.widget.weather.removeLocation', { location: label })}
          onClick={onRemove}
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}
