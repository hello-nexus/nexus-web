import { useEffect, useState } from 'react';
import { useTranslation } from '../../../lib/i18n';
import { canEditFreeText } from '../../types';
import { geocodeWeatherLocations, type WeatherGeocodeResult, type WeatherLocation } from '../../../api/weather';
import { SearchInput } from '../../../components/common/SearchInput/SearchInput';
import { DesktopOnlyBadge } from '../../../components/common/DesktopOnlyBadge/DesktopOnlyBadge';
import type { WidgetSettingsProps } from '../types';
import { SettingsSelect, SettingsSection, SettingsToggle } from '../common/SettingsRow/SettingsRow';
import styles from './WeatherSettings.module.scss';

const SEARCH_DEBOUNCE_MS = 300;
const MIN_QUERY_LENGTH = 2;

function resultLabel(result: WeatherGeocodeResult): string {
  return [result.name, result.admin1, result.country].filter(Boolean).join(', ');
}

export function WeatherSettings({ widget, surface, desktopEditor, onUpdate }: WidgetSettingsProps) {
  const { t, language } = useTranslation();
  const rawUnit = widget.config?.unit as string | undefined;
  const unit = rawUnit === 'C' || rawUnit === 'F' ? rawUnit : 'auto';
  const showCondition = (widget.config?.showCondition as boolean | undefined) ?? true;
  const showLocation = (widget.config?.showLocation as boolean | undefined) ?? true;
  const showDetails = (widget.config?.showDetails as boolean | undefined) ?? true;
  const location = (widget.config?.location as WeatherLocation | null | undefined) ?? null;

  const hasKeyboard = canEditFreeText(surface, desktopEditor);
  const [auto, setAuto] = useState(location === null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<WeatherGeocodeResult[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!hasKeyboard || auto) {
      setResults([]);
      setSearching(false);
      return;
    }
    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) {
      setResults([]);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(() => {
      geocodeWeatherLocations(trimmed, language)
        .then(res => {
          if (cancelled) return;
          setResults(res?.results ?? []);
          setSearching(false);
        })
        .catch(() => {
          if (cancelled) return;
          setResults([]);
          setSearching(false);
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [query, auto, hasKeyboard, language]);

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
    setQuery('');
    setResults([]);
  }

  function clearLocation() {
    onUpdate({ location: null });
    setAuto(true);
    setQuery('');
    setResults([]);
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
              <>
                <SearchInput
                  value={query}
                  onChange={setQuery}
                  placeholder={t('panel.widget.weather.settings.searchLocation')}
                  ariaLabel={t('panel.widget.weather.settings.searchLocation')}
                />
                {searching && <div className={styles.hint}>{t('common.loading')}</div>}
                {!searching && query.trim().length >= MIN_QUERY_LENGTH && results.length === 0 && (
                  <div className={styles.hint}>{t('panel.widget.weather.settings.noLocationResults')}</div>
                )}
                {results.length > 0 && (
                  <div className={styles.results} data-panel-scrollable="true">
                    {results.map((result, index) => (
                      <button
                        key={`${result.latitude}-${result.longitude}-${index}`}
                        type="button"
                        className={styles.resultRow}
                        onClick={() => selectResult(result)}
                      >
                        {resultLabel(result)}
                      </button>
                    ))}
                  </div>
                )}
              </>
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
