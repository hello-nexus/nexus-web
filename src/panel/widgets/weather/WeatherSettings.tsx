import { useState } from 'react';
import { useTranslation } from '../../../lib/i18n';
import { canEditFreeText } from '../../types';
import { type WeatherGeocodeResult, type WeatherLocation } from '../../../api/weather';
import { WeatherLocationSearch } from './WeatherLocationSearch';
import { DesktopOnlyBadge } from '../../../components/common/DesktopOnlyBadge/DesktopOnlyBadge';
import type { WidgetSettingsProps } from '../types';
import { SettingsSelect, SettingsSection, SettingsToggle } from '../common/SettingsRow/SettingsRow';
import styles from './WeatherSettings.module.scss';

export function WeatherSettings({ widget, surface, desktopEditor, onUpdate }: WidgetSettingsProps) {
  const { t } = useTranslation();
  const rawUnit = widget.config?.unit as string | undefined;
  const unit = rawUnit === 'C' || rawUnit === 'F' ? rawUnit : 'auto';
  const showCondition = (widget.config?.showCondition as boolean | undefined) ?? true;
  const showLocation = (widget.config?.showLocation as boolean | undefined) ?? true;
  const showDetails = (widget.config?.showDetails as boolean | undefined) ?? true;
  const location = (widget.config?.location as WeatherLocation | null | undefined) ?? null;

  const hasKeyboard = canEditFreeText(surface, desktopEditor);
  const [auto, setAuto] = useState(location === null);

  function handleAutoChange(checked: boolean) {
    setAuto(checked);
    if (checked) onUpdate({ location: null });
  }

  function selectResult(result: WeatherGeocodeResult) {
    onUpdate({
      location: {
        lat: result.latitude,
        lon: result.longitude,
        label: `${result.name}, ${result.countryCode}`,
        cc: result.countryCode,
      },
    });
    setAuto(false);
  }

  function clearLocation() {
    onUpdate({ location: null });
    setAuto(true);
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
            {location && (
              <div className={styles.currentLocation}>
                <span className={styles.currentLocationLabel}>
                  {t('panel.widget.weather.settings.currentLocation', { location: location.label })}
                </span>
                <button type="button" className={styles.clearButton} onClick={clearLocation}>
                  {t('panel.widget.weather.settings.clearLocation')}
                </button>
              </div>
            )}
            {hasKeyboard ? (
              <WeatherLocationSearch hasKeyboard={hasKeyboard} onSelect={selectResult} />
            ) : (
              !location && <DesktopOnlyBadge />
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
