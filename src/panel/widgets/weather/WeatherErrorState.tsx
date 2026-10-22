import { useUnitPrefs } from '../../../hooks/useUiSettings';
import { useTranslation } from '../../../lib/i18n';
import { resolveHour12 } from '../../../lib/units';
import { WidgetOfflineState } from '../common/WidgetOfflineState';
import type { WeatherSnapshotState } from './useWeatherSnapshot';
import { staleReadingStamp, weatherErrorShortKey, weatherHasNoData } from './weatherError';
import { formatClock } from './weatherFormat';
import styles from './WeatherErrorState.module.scss';

type Props = Pick<WeatherSnapshotState, 'snap' | 'loaded' | 'error'> & { nowMs: number };

// No data at all: the shared offline look with the short reason. Wrap it in a
// sized container; it fills its parent.
export function WeatherNoData({ snap, loaded, error }: Omit<Props, 'nowMs'>) {
  const { t } = useTranslation();
  if (!weatherHasNoData(snap, loaded)) return null;
  return (
    <div className={styles.noData}>
      <WidgetOfflineState label={t(weatherErrorShortKey(error))} />
    </div>
  );
}

// One muted line above a reading whose latest refresh failed.
export function WeatherStaleLine({ snap, loaded, error, nowMs }: Props) {
  const { t, language } = useTranslation();
  const { timeFormat } = useUnitPrefs();
  const stamp = !weatherHasNoData(snap, loaded) && error ? staleReadingStamp(snap, nowMs) : null;
  if (!stamp) return null;
  const time = formatClock(stamp.hour, stamp.minute, resolveHour12(timeFormat), t('panel.widget.weather.am'), t('panel.widget.weather.pm'));
  // The app keeps showing its last reading after the service stops serving
  // it, so a reading from an earlier day carries its date.
  const text = stamp.today
    ? t('panel.widget.weather.error.stale', { time })
    : t('panel.widget.weather.error.staleDate', {
      date: new Intl.DateTimeFormat(language, { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(stamp.day),
      time,
    });
  return <div className={styles.stale} role="status">{text}</div>;
}
