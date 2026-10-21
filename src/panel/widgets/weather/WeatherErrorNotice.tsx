import { Notice } from '../../../components/common/Notice/Notice';
import { useUnitPrefs } from '../../../hooks/useUiSettings';
import { useTranslation } from '../../../lib/i18n';
import { resolveHour12 } from '../../../lib/units';
import type { WeatherSnapshotState } from './useWeatherSnapshot';
import { staleReadingClock, weatherErrorKey, weatherHasNoData } from './weatherError';
import { formatClock } from './weatherFormat';

// Warning notice for a weather surface: why there is no data at all, or that
// the shown reading is the last good one. Null when the reading is fresh.
export function WeatherErrorNotice({ snap, loaded, error }: Pick<WeatherSnapshotState, 'snap' | 'loaded' | 'error'>) {
  const { t } = useTranslation();
  const { timeFormat } = useUnitPrefs();
  if (weatherHasNoData(snap, loaded)) {
    return <Notice tone="warning" role="status">{t(weatherErrorKey(error))}</Notice>;
  }
  const clock = error ? staleReadingClock(snap?.asOf) : null;
  if (!clock) return null;
  const time = formatClock(clock.hour, clock.minute, resolveHour12(timeFormat), t('panel.widget.weather.am'), t('panel.widget.weather.pm'));
  return <Notice tone="warning" role="status">{t('panel.widget.weather.error.stale', { time })}</Notice>;
}
