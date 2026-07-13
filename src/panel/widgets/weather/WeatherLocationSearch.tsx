// Debounced city search over the weather geocoder, shared by the weather
// widget's own settings (WeatherSettings) and the deck "weather" action
// editor (DeckKeyInspector's WeatherFields) - both let the user pick a
// manual location the same way.
import { useEffect, useState } from 'react';
import { useTranslation } from '../../../lib/i18n';
import { geocodeWeatherLocations, type WeatherGeocodeResult } from '../../../api/weather';
import { SearchInput } from '../../../components/common/SearchInput/SearchInput';
import styles from './WeatherLocationSearch.module.scss';

const SEARCH_DEBOUNCE_MS = 300;
const MIN_QUERY_LENGTH = 2;

export function weatherResultLabel(result: WeatherGeocodeResult): string {
  return [result.name, result.admin1, result.country].filter(Boolean).join(', ');
}

export interface WeatherLocationSearchProps {
  // False on a keyboard-less surface (Y70/Q-series) - the caller shows a
  // DesktopOnlyBadge instead when there's no location chosen yet.
  hasKeyboard: boolean;
  onSelect: (result: WeatherGeocodeResult) => void;
}

export function WeatherLocationSearch({ hasKeyboard, onSelect }: WeatherLocationSearchProps) {
  const { t, language } = useTranslation();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<WeatherGeocodeResult[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!hasKeyboard) {
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
  }, [query, hasKeyboard, language]);

  if (!hasKeyboard) return null;

  function handleSelect(result: WeatherGeocodeResult) {
    onSelect(result);
    setQuery('');
    setResults([]);
  }

  return (
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
              onClick={() => handleSelect(result)}
            >
              {weatherResultLabel(result)}
            </button>
          ))}
        </div>
      )}
    </>
  );
}

export default WeatherLocationSearch;
