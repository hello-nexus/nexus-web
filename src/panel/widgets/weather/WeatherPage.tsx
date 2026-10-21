import { useEffect, useMemo, useState } from 'react';
import { ChipGroup } from '../../../components/common/ChipGroup/ChipGroup';
import { SectionHeader } from '../../../components/common/SectionHeader/SectionHeader';
import { ViewHeader } from '../../../components/common/ViewHeader/ViewHeader';
import { Notice } from '../../../components/common/Notice/Notice';
import { useUnitPrefs } from '../../../hooks/useUiSettings';
import { useTranslation } from '../../../lib/i18n';
import { resolveHour12 } from '../../../lib/units';
import type { WeatherUnitPref } from '../../../api/weather';
import { WeatherDailyList } from './WeatherDailyList';
import { WeatherDetailTiles } from './WeatherDetailTiles';
import { WeatherHero } from './WeatherHero';
import { WeatherHourlyStrip } from './WeatherHourlyStrip';
import { AUTO_PLACE_KEY, buildPlaces, WeatherLocationList } from './WeatherLocationList';
import { useWallClock } from './useWallClock';
import { useWeatherPrefs } from './useWeatherPrefs';
import { useWeatherSnapshot } from './useWeatherSnapshot';
import { staleReadingClock, weatherErrorKey, weatherHasNoData } from './weatherError';
import { formatClock, resolveUnit } from './weatherFormat';
import styles from './WeatherPage.module.scss';

const UNIT_KEYS: WeatherUnitPref[] = ['auto', 'C', 'F'];

/**
 * Desktop app page for the Weather widget: saved places in a left rail, the
 * selected place's conditions on the right. Title comes from the manifest's
 * i18nKey (`panel.widget.weather`), app-page convention (see ClockPage).
 */
export function WeatherPage() {
  const { t } = useTranslation();
  const { prefs, addLocation, removeLocation, setUnit } = useWeatherPrefs();
  const places = useMemo(() => buildPlaces(prefs.locations), [prefs.locations]);
  const [selectedKey, setSelectedKey] = useState(AUTO_PLACE_KEY);
  const selected = places.find(p => p.key === selectedKey) ?? places[0];
  const { snap, loaded, error } = useWeatherSnapshot(selected.location);
  const { timeFormat } = useUnitPrefs();
  const noData = weatherHasNoData(snap, loaded);
  const staleClock = !noData && error ? staleReadingClock(snap?.asOf) : null;
  const unit = resolveUnit(prefs.unit, selected.location?.cc ?? snap?.countryCode);
  const now = useWallClock();

  // A removed place falls back to the auto entry.
  useEffect(() => {
    if (!places.some(p => p.key === selectedKey)) setSelectedKey(AUTO_PLACE_KEY);
  }, [places, selectedKey]);

  const unitChips = UNIT_KEYS.map(key => ({
    key,
    label: key === 'auto' ? t('panel.widget.weather.settings.auto') : `°${key}`,
  }));

  return (
    <div className={styles.app}>
      <ViewHeader
        title={t('panel.widget.weather')}
        tabsAdjacent={<SectionHeader className={styles.railTitle}>{t('panel.widget.weather.locations')}</SectionHeader>}
        tabActions={(
          <ChipGroup
            ariaLabel={t('panel.widget.weather.settings.temperature')}
            options={unitChips}
            activeKey={prefs.unit}
            onChange={key => setUnit(key as WeatherUnitPref)}
          />
        )}
      />
      <div className={`pageBodyFill ${styles.body}`}>
        <aside className={styles.rail}>
          <WeatherLocationList
            places={places}
            selectedKey={selected.key}
            onSelect={setSelectedKey}
            onAdd={addLocation}
            onRemove={removeLocation}
            unitPref={prefs.unit}
            canSearch
            showTitle={false}
            nowMs={now}
          />
        </aside>
        <section className={styles.detail} data-panel-scrollable="true">
          {noData && <Notice tone="warning" role="status">{t(weatherErrorKey(error))}</Notice>}
          {staleClock && (
            <Notice tone="warning" role="status">
              {t('panel.widget.weather.error.stale', {
                time: formatClock(staleClock.hour, staleClock.minute, resolveHour12(timeFormat), t('panel.widget.weather.am'), t('panel.widget.weather.pm')),
              })}
            </Notice>
          )}
          {!noData && (
            <>
              <WeatherHero
                snap={snap}
                loaded={loaded}
                unit={unit}
                label={selected.location ? selected.location.label : (snap?.locationLabel || t('panel.widget.weather.myLocation'))}
              />
              <WeatherHourlyStrip snap={snap} unit={unit} />
              <WeatherDailyList snap={snap} unit={unit} />
              <WeatherDetailTiles snap={snap} unit={unit} nowMs={now} />
            </>
          )}
        </section>
      </div>
    </div>
  );
}

export default WeatherPage;
