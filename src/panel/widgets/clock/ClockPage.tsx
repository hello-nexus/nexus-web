import { useEffect, useMemo, useState } from 'react';
import { MapPin } from 'lucide-react';
import { Card } from '../../../components/common/Card/Card';
import { ViewHeader } from '../../../components/common/ViewHeader/ViewHeader';
import { useTranslation } from '../../../lib/i18n';
import { CITIES, type City } from './cities';
import { isDaylight } from './solar';
import { WorldClockMap } from './WorldClockMap';
import styles from './ClockPage.module.scss';

/**
 * Desktop "app view" for the Clock widget. Two things:
 *
 *   • A day/night world map at the top — equirectangular projection,
 *     live solar terminator, subsolar sun marker, the curated city
 *     set marked as pins, the user's local timezone (if it maps to
 *     a catalog city) highlighted in gold.
 *
 *   • A scrollable list of city cards beneath, each showing the
 *     local weekday / time / UTC offset, tinted day vs night.
 *
 * Per-clock-widget customisation (design, format, etc.) lives in the
 * regular widget right-click context menu / edit sheet — same UX
 * vocabulary as every other app. This page deliberately carries no
 * customisation surface; it's the "Clocks" experience.
 */
export function ClockPage() {
  const { t } = useTranslation();
  const localTz = useMemo(() => resolveLocalTz(), []);
  const [now, setNow] = useState(() => new Date());

  // Tick once per UTC minute aligned to the wall-clock minute. That's
  // the granularity the terminator visibly moves at AND the granularity
  // city minute labels need; no per-second re-render needed.
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

  return (
    <div className={styles.app}>
      <ViewHeader title={t('nav.clock')} />
      <div className={styles.body}>
        <div className={styles.mapSlot}>
          <WorldClockMap now={now} cities={CITIES} highlightTz={localTz} />
        </div>
        <div className={styles.cityList}>
          {CITIES.map(city => (
            <CityCard key={city.tz} city={city} now={now} local={city.tz === localTz} />
          ))}
        </div>
      </div>
    </div>
  );
}

function CityCard({ city, now, local }: { city: City; now: Date; local: boolean }) {
  const { t } = useTranslation();
  const time = useMemo(() => formatLocalLong(now, city.tz), [now, city.tz]);
  const offset = useMemo(() => formatUtcOffset(now, city.tz), [now, city.tz]);
  const day = isDaylight(city.lat, city.lon, now);
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
      actions={<span className={styles.cityCardTime}>{time}</span>}
      className={`${styles.cityCard} ${local ? styles.cityCardLocal : day ? styles.cityCardDay : styles.cityCardNight}`}
    />
  );
}

function resolveLocalTz(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return 'UTC'; }
}

function formatLocalLong(now: Date, tz: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: tz, weekday: 'short', hour: 'numeric', minute: '2-digit', hour12: false,
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

export default ClockPage;
