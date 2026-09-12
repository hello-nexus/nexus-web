import { useState } from 'react';
import { useTranslation } from '../../../lib/i18n';
import { canEditFreeText, type PanelConfigValue } from '../../types';
import {
  geocodeResultToLocation,
  sameWeatherLocation,
  weatherLocationKey,
  type WeatherGeocodeResult,
  type WeatherLocation,
} from '../../../api/weather';
import { WeatherLocationSearch } from './WeatherLocationSearch';
import { useWeatherPrefs } from './useWeatherPrefs';
import { DesktopOnlyBadge } from '../../../components/common/DesktopOnlyBadge/DesktopOnlyBadge';
import type { WidgetSettingsProps } from '../types';
import { SettingsSelect, SettingsSection, SettingsToggle } from '../common/SettingsRow/SettingsRow';
import styles from './WeatherSettings.module.scss';

// PanelConfigValue needs an index signature; the interface has none.
function toConfig(location: WeatherLocation): PanelConfigValue {
  return { lat: location.lat, lon: location.lon, label: location.label, cc: location.cc };
}

export function WeatherSettings({ widget, surface, desktopEditor, onUpdate }: WidgetSettingsProps) {
  const { t } = useTranslation();
  const { prefs, addLocation } = useWeatherPrefs();
  const rawUnit = widget.config?.unit as string | undefined;
  const unit = rawUnit === 'C' || rawUnit === 'F' ? rawUnit : 'auto';
  const showCondition = (widget.config?.showCondition as boolean | undefined) ?? true;
  const showLocation = (widget.config?.showLocation as boolean | undefined) ?? true;
  const showDetails = (widget.config?.showDetails as boolean | undefined) ?? true;
  const location = (widget.config?.location as WeatherLocation | null | undefined) ?? null;

  const hasKeyboard = canEditFreeText(surface, desktopEditor);
  const [auto, setAuto] = useState(location === null);

  // The picker lists every saved place plus the widget's own pick when that
  // predates the shared list, so a legacy config still shows its city.
  const choices = location && !prefs.locations.some(l => sameWeatherLocation(l, location))
    ? [location, ...prefs.locations]
    : prefs.locations;

  function handleAutoChange(checked: boolean) {
    setAuto(checked);
    if (checked) onUpdate({ location: null });
  }

  function selectSaved(key: string) {
    const picked = choices.find(l => weatherLocationKey(l) === key);
    if (picked) onUpdate({ location: toConfig(picked) });
  }

  function selectResult(result: WeatherGeocodeResult) {
    const picked = geocodeResultToLocation(result);
    addLocation(picked);
    onUpdate({ location: toConfig(picked) });
    setAuto(false);
  }

  return (
    <div className={styles.settingsRoot}>
      <SettingsSection title={t('panel.widget.weather.settings.units')}>
        <SettingsSelect
          label={t('panel.widget.weather.settings.temperature')}
          value={unit}
          options={[
            // eslint-disable-next-line i18next/no-literal-string -- enum value
            { value: 'auto', label: t('panel.widget.weather.settings.auto') },
            { value: 'C', label: t('panel.widget.weather.settings.celsius') },
            { value: 'F', label: t('panel.widget.weather.settings.fahrenheit') },
          ]}
          onChange={value => onUpdate({ unit: value })}
        />
      </SettingsSection>

      <SettingsSection title={t('panel.widget.weather.settings.location')}>
        <SettingsToggle
          label={t('panel.widget.weather.settings.autoLocation')}
          checked={auto}
          onChange={handleAutoChange}
        />
        {!auto && (
          <div className={styles.locationPicker}>
            {choices.length > 0 && (
              <SettingsSelect
                label={t('panel.widget.weather.settings.savedLocation')}
                value={location ? weatherLocationKey(location) : ''}
                options={[
                  ...(location ? [] : [{ value: '', label: t('panel.widget.weather.settings.pickLocation') }]),
                  ...choices.map(l => ({ value: weatherLocationKey(l), label: l.label })),
                ]}
                onChange={selectSaved}
              />
            )}
            {hasKeyboard ? (
              <WeatherLocationSearch hasKeyboard={hasKeyboard} onSelect={selectResult} />
            ) : (
              choices.length === 0 && <DesktopOnlyBadge />
            )}
          </div>
        )}
      </SettingsSection>

      <SettingsSection title={t('panel.widget.weather.settings.display')}>
        <SettingsToggle
          label={t('panel.widget.weather.settings.condition')}
          checked={showCondition}
          onChange={checked => onUpdate({ showCondition: checked })}
        />
        <SettingsToggle
          label={t('panel.widget.weather.settings.location')}
          checked={showLocation}
          onChange={checked => onUpdate({ showLocation: checked })}
        />
        <SettingsToggle
          label={t('panel.widget.weather.settings.humidityAndWind')}
          checked={showDetails}
          onChange={checked => onUpdate({ showDetails: checked })}
        />
      </SettingsSection>
    </div>
  );
}

export default WeatherSettings;
