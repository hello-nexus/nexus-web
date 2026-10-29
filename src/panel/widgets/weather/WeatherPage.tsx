import { useEffect, useMemo, useRef, useState } from 'react';
import { ChipGroup } from '../../../components/common/ChipGroup/ChipGroup';
import { SectionHeader } from '../../../components/common/SectionHeader/SectionHeader';
import { ViewHeader } from '../../../components/common/ViewHeader/ViewHeader';
import { useTranslation } from '../../../lib/i18n';
import { sameWeatherLocation, type WeatherLocation, type WeatherUnitPref } from '../../../api/weather';
import { WeatherDailyList } from './WeatherDailyList';
import { WeatherDetailTiles } from './WeatherDetailTiles';
import { WeatherHero } from './WeatherHero';
import { WeatherHourlyStrip } from './WeatherHourlyStrip';
import { AUTO_PLACE_KEY, buildPlaces, placeKeyFromRouteTab, WeatherLocationList } from './WeatherLocationList';
import { useWallClock } from './useWallClock';
import { useWeatherPrefs } from './useWeatherPrefs';
import { useWeatherSnapshot } from './useWeatherSnapshot';
import { resolveUnit } from './weatherFormat';
import styles from './WeatherPage.module.scss';

const UNIT_KEYS: WeatherUnitPref[] = ['auto', 'C', 'F'];

/**
 * Desktop app page for the Weather widget: saved places in a left rail, the
 * selected place's conditions on the right. Title comes from the manifest's
 * i18nKey (`panel.widget.weather`), app-page convention (see ClockPage).
 */
export function WeatherPage({ tab }: { tab?: string }) {
  const { t } = useTranslation();
  const { prefs, loaded: prefsLoaded, addLocation, removeLocation, setUnit } = useWeatherPrefs();
  // A widget's place missing from the saved list; shown, never saved.
  const [unsaved, setUnsaved] = useState<WeatherLocation | null>(null);
  const places = useMemo(
    () => buildPlaces(unsaved && !prefs.locations.some(l => sameWeatherLocation(l, unsaved)) ? [unsaved, ...prefs.locations] : prefs.locations),
    [prefs.locations, unsaved],
  );
  const [selectedKey, setSelectedKey] = useState(AUTO_PLACE_KEY);
  const selected = places.find(p => p.key === selectedKey) ?? places[0];
  const { snap, loaded } = useWeatherSnapshot(selected.location);
  const unit = resolveUnit(prefs.unit, selected.location?.cc || snap?.countryCode);
  const now = useWallClock();

  // A widget opens the page on its own place (route tab). Applied once per tab
  // value, after the saved list loads. Selection is page state only, the saved
  // list and unit are untouched.
  const appliedTab = useRef<string | undefined>(undefined);
  useEffect(() => {
    const wanted = placeKeyFromRouteTab(tab);
    if (!wanted || appliedTab.current === tab || !prefsLoaded) return;
    appliedTab.current = tab;
    if (!places.some(p => p.key === wanted)) {
      const [lat, lon] = wanted.split(',').map(Number);
      // The tab carries no name; the coordinates label it, cc stays empty so the unit follows the snapshot.
      setUnsaved({ lat, lon, label: `${lat}, ${lon}`, cc: '' });
    }
    setSelectedKey(wanted);
  }, [tab, places, prefsLoaded]);

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
            onRemove={location => (sameWeatherLocation(location, unsaved) ? setUnsaved(null) : removeLocation(location))}
            unitPref={prefs.unit}
            canSearch
            showTitle={false}
            nowMs={now}
          />
        </aside>
        <section className={styles.detail} data-panel-scrollable="true">
          <WeatherHero
            snap={snap}
            loaded={loaded}
            unit={unit}
            label={selected.location ? selected.location.label : (snap?.locationLabel || t('panel.widget.weather.myLocation'))}
          />
          <WeatherHourlyStrip snap={snap} unit={unit} />
          <WeatherDailyList snap={snap} unit={unit} />
          <WeatherDetailTiles snap={snap} unit={unit} nowMs={now} />
        </section>
      </div>
    </div>
  );
}

export default WeatherPage;
