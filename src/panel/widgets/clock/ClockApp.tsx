import { useCallback, useEffect, useMemo, useState } from 'react';
import { MapPin, Plus, X } from 'lucide-react';
import { Card } from '../../../components/common/Card/Card';
import { ViewHeader } from '../../../components/common/ViewHeader/ViewHeader';
import { useTranslation } from '../../../lib/i18n';
import { CITY_CATALOG, DEFAULT_CITY_IDS, getCity, type City } from './cities';
import { isDaylight } from './solar';
import { WorldClockMap } from './WorldClockMap';
import styles from './ClockApp.module.scss';

/**
 * Desktop "app view" for the Clock widget. Single surface: the world
 * clock — day/night map of the planet with the live solar terminator,
 * the subsolar point, and live local times for cities the user has
 * favourited.
 *
 * Per-clock-widget customisation (design, format, show-seconds, etc.)
 * lives in the regular widget right-click context menu / edit sheet —
 * same UX vocabulary as every other widget. This page deliberately
 * carries none of that; it's the "Clocks app" surface.
 *
 * Persistence: localStorage under `qos_clock_app`. The app isn't bound
 * to any single dashboard widget instance — it's a standalone "Clocks"
 * experience, like the system clock app on iOS / macOS.
 *
 * The first row is always the user's local timezone (resolved via the
 * Intl API) so the world view always anchors on where the user
 * actually is. The local entry is pinned and can't be removed.
 */

interface ClockAppState {
  cityIds: string[];
}

const STORAGE_KEY = 'qos_clock_app';
const DEFAULT_STATE: ClockAppState = { cityIds: [...DEFAULT_CITY_IDS] };

function loadState(): ClockAppState {
  if (typeof window === 'undefined') return DEFAULT_STATE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    const parsed = JSON.parse(raw);
    const cleanCityIds = Array.isArray(parsed.cityIds)
      ? parsed.cityIds.filter((id: unknown): id is string =>
          typeof id === 'string' && Boolean(getCity(id)))
      : DEFAULT_STATE.cityIds;
    return { cityIds: cleanCityIds };
  } catch {
    return DEFAULT_STATE;
  }
}

function saveState(state: ClockAppState): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch { /* quota / private mode — ignore */ }
}

function resolveLocalTz(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return 'UTC';
  }
}

export function ClockApp() {
  const { t } = useTranslation();
  const [state, setState] = useState<ClockAppState>(() => loadState());
  const [now, setNow] = useState(() => new Date());
  const [pickerOpen, setPickerOpen] = useState(false);
  const localTz = useMemo(resolveLocalTz, []);

  // Map ticks once per UTC minute (aligned to the wall-clock minute).
  // That's the granularity the terminator visibly moves at and the
  // city minute labels need the same beat.
  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const ms = 60_000 - (Date.now() % 60_000);
    let interval: number | null = null;
    const align = window.setTimeout(() => {
      tick();
      interval = window.setInterval(tick, 60_000);
    }, ms);
    return () => {
      window.clearTimeout(align);
      if (interval !== null) window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    saveState(state);
  }, [state]);

  // Selected catalog cities, in user order. Whichever catalog entry
  // (if any) matches the local timezone is removed from this list —
  // the local row is always rendered separately at row 0.
  const localCatalogCity = useMemo<City | undefined>(
    () => CITY_CATALOG.find(c => c.tz === localTz),
    [localTz],
  );

  const selectedCities = useMemo<City[]>(
    () => state.cityIds
      .map(id => getCity(id))
      .filter((c): c is City => Boolean(c))
      .filter(c => c.tz !== localTz),
    [state.cityIds, localTz],
  );

  // City pins on the map include the local catalog city (if any)
  // alongside the user's selections, so the map always marks where
  // the user is.
  const mappedCities = useMemo<City[]>(() => {
    return localCatalogCity
      ? [localCatalogCity, ...selectedCities]
      : selectedCities;
  }, [selectedCities, localCatalogCity]);

  const selectedIds = useMemo(() => new Set([
    ...selectedCities.map(c => c.id),
    ...(localCatalogCity ? [localCatalogCity.id] : []),
  ]), [selectedCities, localCatalogCity]);
  const availableCities = useMemo(
    () => CITY_CATALOG.filter(c => !selectedIds.has(c.id)),
    [selectedIds],
  );

  const addCity = useCallback((id: string) => {
    setState(prev => prev.cityIds.includes(id)
      ? prev
      : { cityIds: [...prev.cityIds, id] });
  }, []);
  const removeCity = useCallback((id: string) => {
    setState(prev => ({ cityIds: prev.cityIds.filter(x => x !== id) }));
  }, []);

  // Synthesise a local-row "City" so the same CityCard renders it.
  // lat/lon are 0 / 0 because we don't know the user's actual
  // coordinates — but the local catalog city (if matched) already
  // contributes the dot to the map, so this row is text-only on
  // purpose when no catalog match exists.
  const localCardCity: City = useMemo(() => localCatalogCity ?? {
    id: 'local',
    name: t('clock.app.localTime'),
    country: localTz,
    tz: localTz,
    lat: 0,
    lon: 0,
  }, [localCatalogCity, localTz, t]);

  return (
    <div className={styles.app}>
      <ViewHeader title={t('nav.clock')} />
      <div className={styles.body}>
        <div className={styles.mapSlot}>
          <WorldClockMap now={now} cities={mappedCities} highlightTz={localTz} />
        </div>

        <div className={styles.citiesPanel}>
          <div className={styles.citiesHeader}>
            <span className={styles.sectionLabel}>{t('clock.app.cities')}</span>
            <button
              type="button"
              className={styles.addCityBtn}
              onClick={() => setPickerOpen(p => !p)}
            >
              <Plus size={14} />
              <span>{t('clock.app.addCity')}</span>
            </button>
          </div>

          {pickerOpen && (
            <div className={styles.cityPicker}>
              {availableCities.length === 0
                ? <span className={styles.cityPickerEmpty}>{t('clock.app.allCitiesAdded')}</span>
                : availableCities.map(c => (
                  <button
                    key={c.id}
                    type="button"
                    className={styles.cityChip}
                    onClick={() => { addCity(c.id); }}
                  >
                    <span className={styles.cityChipName}>{c.name}</span>
                    <span className={styles.cityChipCountry}>{c.country}</span>
                  </button>
                ))}
            </div>
          )}

          <div className={styles.cityList}>
            <CityCard
              key="local"
              city={localCardCity}
              now={now}
              local
              onRemove={null}
            />
            {selectedCities.map(c => (
              <CityCard
                key={c.id}
                city={c}
                now={now}
                local={false}
                onRemove={() => removeCity(c.id)}
              />
            ))}
            {selectedCities.length === 0 && (
              <div className={styles.cityListEmpty}>{t('clock.app.noCities')}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

interface CityCardProps {
  city: City;
  now: Date;
  local: boolean;
  onRemove: (() => void) | null;
}

function CityCard({ city, now, local, onRemove }: CityCardProps) {
  const { t } = useTranslation();
  const time = useMemo(() => formatLocalLong(now, city.tz), [now, city.tz]);
  const offset = useMemo(() => formatUtcOffset(now, city.tz), [now, city.tz]);
  const day = isDaylight(city.lat, city.lon, now);
  const subtitleParts = [city.country, offset].filter(Boolean).join(' · ');

  return (
    <Card
      title={
        <span className={styles.cityCardTitle}>
          {city.name}
          {local && (
            <span className={styles.localBadge} aria-label={t('clock.app.localTz')}>
              <MapPin size={11} />
              {t('clock.app.localShort')}
            </span>
          )}
        </span>
      }
      subtitle={subtitleParts}
      actions={
        <div className={styles.cityCardActions}>
          <span className={styles.cityCardTime}>{time}</span>
          {onRemove !== null && (
            <button
              type="button"
              className={styles.cityCardRemove}
              onClick={onRemove}
              aria-label="Remove city"
            >
              <X size={14} />
            </button>
          )}
        </div>
      }
      className={`${styles.cityCard} ${local ? styles.cityCardLocal : day ? styles.cityCardDay : styles.cityCardNight}`}
    />
  );
}

function formatLocalLong(now: Date, tz: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      weekday: 'short',
      hour: 'numeric',
      minute: '2-digit',
      hour12: false,
    }).format(now);
  } catch {
    return '--';
  }
}

function formatUtcOffset(now: Date, tz: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      timeZoneName: 'shortOffset',
    }).formatToParts(now);
    const tzName = parts.find(p => p.type === 'timeZoneName')?.value;
    if (tzName) return tzName.replace('GMT', 'UTC');
  } catch { /* fallthrough */ }
  return '';
}

export default ClockApp;
