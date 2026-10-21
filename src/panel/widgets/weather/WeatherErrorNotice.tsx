import { Notice } from '../../../components/common/Notice/Notice';
import { useUnitPrefs } from '../../../hooks/useUiSettings';
import { useTranslation } from '../../../lib/i18n';
import { resolveHour12 } from '../../../lib/units';
import type { WeatherSnapshotState } from './useWeatherSnapshot';
import { useWallClock } from './useWallClock';
import { staleReadingStamp, weatherErrorKey, weatherHasNoData } from './weatherError';
import { formatClock } from './weatherFormat';

// Warning notice for a weather surface: why there is no data at all, or that
// the shown reading is the last good one. Null when the reading is fresh.
export function WeatherErrorNotice({ snap, loaded, error }: Pick<WeatherSnapshotState, 'snap' | 'loaded' | 'error'>) {
  const { t, language } = useTranslation();
  const { timeFormat } = useUnitPrefs();
  const now = useWallClock();
  if (weatherHasNoData(snap, loaded)) {
    return <Notice tone="warning" role="status">{t(weatherErrorKey(error))}</Notice>;
  }
  const stamp = error ? staleReadingStamp(snap, now) : null;
  if (!stamp) return null;
  const time = formatClock(stamp.hour, stamp.minute, resolveHour12(timeFormat), t('panel.widget.weather.am'), t('panel.widget.weather.pm'));
  // The service keeps a reading for 2h, but the app keeps showing its last one
  // indefinitely, so an older reading carries its date.
  const text = stamp.today
    ? t('panel.widget.weather.error.stale', { time })
    : t('panel.widget.weather.error.staleDate', {
      date: new Intl.DateTimeFormat(language, { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(stamp.day),
      time,
    });
  return <Notice tone="warning" role="status">{text}</Notice>;
}
