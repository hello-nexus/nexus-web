// The Clock page body: a day/night world map fixed at the top, over an
// editable list of city cards (weekday / time / UTC offset, tinted day vs
// night, local tz highlighted). The user adds/removes cities; only the ones in
// the list appear on the map. The selection persists in localStorage - the only
// store a page-level view can reach (the immersive Page facet gets no widget
// config). Self-ticking, no app deps - so BOTH the native ClockPage and the
// blessed SDK `ui-worldclock` composite render this exact component.

import { useEffect, useMemo, useState } from 'react';
import { MapPin, Plus, X } from 'lucide-react';
import { Card } from '../../../components/common/Card/Card';
import { Button } from '../../../components/common/Button/Button';
import { SearchInput } from '../../../components/common/SearchInput/SearchInput';
import { usePersistentState } from '../../../hooks/usePersistentState';
import { useTranslation } from '../../../lib/i18n';
import { CITY_BY_ID, CITY_CATALOG, cityMatches, DEFAULT_CITY_IDS, type City } from './cities';
import { WorldClockMap } from './WorldClockMap';
import { useUnitPrefs } from '../../../hooks/useUiSettings';
import styles from './ClockPage.module.scss';

const STORAGE_KEY = 'clock.cities';

export function ClockWorldView({ highlightTz }: { highlightTz?: string }) {
  const { t } = useTranslation();
  const { timeFormat } = useUnitPrefs();
  // The world surfaces have always rendered 24-hour; 'system' keeps that and
  // only an explicit 12-hour pick moves them, so the default look is unchanged.
  const hour12 = timeFormat === '12h';
  const localTz = useMemo(() => highlightTz || resolveLocalTz(), [highlightTz]);
  const [now, setNow] = useState(() => new Date());
  const [cityIds, setCityIds] = usePersistentState<string[]>(STORAGE_KEY, [...DEFAULT_CITY_IDS]);
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState('');

  // Tick once per minute, aligned to the wall-clock minute: the granularity
  // both the terminator and the city minute labels need.
  useEffect(() => {
    const tick = () => setNow(new Date());
    const wait = 60_000 - (Date.now() % 60_000);
    let interval: number | null = null;
    const align = window.setTimeout(() => {
      tick();
      interval = window.setInterval(tick, 60_000);
    }, wait);
    return () => {
      window.clearTimeout(align);
      if (interval !== null) window.clearInterval(interval);
    };
  }, []);

  const selected = useMemo(
    () => cityIds.map(id => CITY_BY_ID.get(id)).filter((c): c is City => c !== undefined),
    [cityIds],
  );
  const selectedIds = useMemo(() => new Set(selected.map(c => c.id)), [selected]);

  const addCity = (id: string) =>
    setCityIds(prev => (prev.includes(id) ? prev : [...prev, id]));
  const removeCity = (id: string) =>
    setCityIds(prev => prev.filter(x => x !== id));

  const toggleAdding = () => {
    setQuery('');
    setAdding(a => !a);
  };

  return (
    <div className={styles.body}>
      <div className={styles.mapSlot}>
        <WorldClockMap now={now} cities={selected} highlightTz={localTz} hour12={hour12} />
      </div>

      <div className={styles.listHeader}>
        <Button
          tone="neutral"
          size="sm"
          icon={adding ? <X size={15} /> : <Plus size={15} />}
          onClick={toggleAdding}
        >
          {adding ? t('clock.app.done') : t('clock.app.addCity')}
        </Button>
      </div>

      {adding && (
        <AddCityPicker
          query={query}
          onQuery={setQuery}
          now={now}
          selectedIds={selectedIds}
          hour12={hour12}
          onAdd={addCity}
        />
      )}

      <div className={styles.cityList}>
        {selected.length === 0 ? (
          <div className={styles.emptyState}>{t('clock.app.empty')}</div>
        ) : (
          selected.map(city => (
            <CityCard
              key={city.id}
              city={city}
              now={now}
              local={city.tz === localTz}
              hour12={hour12}
              onRemove={() => removeCity(city.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function CityCard({
  city, now, local, hour12, onRemove,
}: { city: City; now: Date; local: boolean; hour12: boolean; onRemove: () => void }) {
  const { t } = useTranslation();
  const time = useMemo(() => formatLocalLong(now, city.tz, hour12), [now, city.tz, hour12]);
  const offset = useMemo(() => formatUtcOffset(now, city.tz), [now, city.tz]);
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
      subtitle={`${city.country} · ${offset}`}
      actions={
        <span className={styles.cityCardActions}>
          <span className={styles.cityCardTime}>{time}</span>
          <Button
            tone="ghost"
            size="sm"
            icon={<X size={15} />}
            onClick={onRemove}
            aria-label={t('clock.app.remove')}
            title={t('clock.app.remove')}
          />
        </span>
      }
      className={styles.cityCard}
    />
  );
}

function AddCityPicker({
  query, onQuery, now, selectedIds, hour12, onAdd,
}: {
  query: string;
  onQuery: (v: string) => void;
  now: Date;
  selectedIds: ReadonlySet<string>;
  hour12: boolean;
  onAdd: (id: string) => void;
}) {
  const { t } = useTranslation();
  const matches = useMemo(
    () => CITY_CATALOG.filter(c => !selectedIds.has(c.id) && cityMatches(c, query)),
    [query, selectedIds],
  );

  return (
    <div className={styles.addPanel}>
      <SearchInput
        value={query}
        onChange={onQuery}
        placeholder={t('clock.app.searchCities')}
        ariaLabel={t('clock.app.searchCities')}
        autoFocus
      />
      <div className={styles.addResults}>
        {matches.length === 0 ? (
          <div className={styles.emptyState}>{t('clock.app.noResults')}</div>
        ) : (
          matches.map(city => (
            <Card
              key={city.id}
              interactive
              onClick={() => onAdd(city.id)}
              title={city.name}
              subtitle={`${city.country} · ${formatUtcOffset(now, city.tz)}`}
              actions={
                <span className={styles.addResultAction}>
                  <span className={styles.cityCardTime}>{formatLocalLong(now, city.tz, hour12)}</span>
                  <Plus size={16} aria-hidden="true" />
                </span>
              }
              className={styles.addResultCard}
            />
          ))
        )}
      </div>
    </div>
  );
}

function resolveLocalTz(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return 'UTC'; }
}

function formatLocalLong(now: Date, tz: string, hour12: boolean): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: tz, weekday: 'short', hour: 'numeric', minute: '2-digit', hour12,
    }).format(now);
  } catch { return '--'; }
}

function formatUtcOffset(now: Date, tz: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'shortOffset' })
      .formatToParts(now);
    const name = parts.find(p => p.type === 'timeZoneName')?.value;
    if (name) return name.replace('GMT', 'UTC');
  } catch { /* fallthrough */ }
  return '';
}

export default ClockWorldView;
