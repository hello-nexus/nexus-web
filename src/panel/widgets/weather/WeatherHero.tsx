import { useTranslation } from '../../../lib/i18n';
import type { WeatherSnapshot } from '../../../api/weather';
import { weatherConditionKey } from './weatherConditions';
import { WeatherIcon } from './WeatherIcon';
import { apparentTemp, currentTemp, dailyMax, dailyMin, formatTemp, type WeatherUnit } from './weatherFormat';
import styles from './WeatherHero.module.scss';

export interface WeatherHeroProps {
  snap: WeatherSnapshot | null;
  loaded: boolean;
  unit: WeatherUnit;
  // Overrides the snapshot's own label (the auto entry reads "My Location").
  label?: string;
  // Larger type for the immersive cell.
  immersive?: boolean;
}

// Current conditions block shared by the page and the immersive view:
// location, big temperature, condition, today's range and feels-like.
export function WeatherHero({ snap, loaded, unit, label, immersive }: WeatherHeroProps) {
  const { t } = useTranslation();
  const conditionKey = weatherConditionKey(snap?.weatherCode);
  const conditionText = conditionKey ? t(conditionKey) : (snap?.condition || '');
  const today = snap?.daily?.[0];
  const hi = today ? dailyMax(today, unit) : null;
  const lo = today ? dailyMin(today, unit) : null;
  const feels = apparentTemp(snap, unit);
  const temp = currentTemp(snap, unit);

  return (
    <div className={`${styles.hero} ${immersive ? styles.immersive : ''}`}>
      <div className={styles.location}>{label ?? snap?.locationLabel ?? ''}</div>
      <div className={styles.temp}>{formatTemp(temp, loaded ? '--' : '…')}</div>
      <div className={styles.conditionRow}>
        <WeatherIcon code={snap?.weatherCode} isDay={snap?.isDay} className={styles.icon} strokeWidth={1.6} />
        <span className={styles.condition}>{loaded && !snap ? t('panel.widget.weather.noData') : conditionText}</span>
      </div>
      <div className={styles.metaRow}>
        {hi !== null && hi !== undefined && lo !== null && lo !== undefined && (
          <span>{t('panel.widget.weather.hiLo', { hi: Math.round(hi), lo: Math.round(lo) })}</span>
        )}
        {feels !== null && feels !== undefined && (
          <span>{t('panel.widget.weather.feelsLikeValue', { value: formatTemp(feels) })}</span>
        )}
      </div>
    </div>
  );
}
