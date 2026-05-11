import type { WattageEstimate } from '../../../types/builder';
import { useTranslation } from '../../../lib/i18n';
import styles from './WattageEstimator.module.scss';

interface WattageEstimatorProps {
  wattage: WattageEstimate;
  psuWattage: number | null;
}

export function WattageEstimator({ wattage, psuWattage }: WattageEstimatorProps) {
  const { t } = useTranslation();
  const total = wattage.total;

  if (total <= 50) return null; // Only system overhead, nothing selected

  const capacity = psuWattage ?? wattage.recommendedPsu;
  const ratio = capacity > 0 ? total / capacity : 0;
  const percent = Math.min(ratio * 100, 100);

  let barClass = styles.barGreen;
  if (ratio > 0.8) barClass = styles.barRed;
  else if (ratio > 0.6) barClass = styles.barYellow;

  return (
    <div className={styles.estimator}>
      <div className={styles.label}>
        <span>{t('builder.estimated_wattage')}</span>
        <span className={styles.values}>
          {psuWattage != null
            ? `${total}W / ${psuWattage}W`
            : `${total}W`
          }
        </span>
      </div>
      <div className={styles.track}>
        <div className={`${styles.bar} ${barClass}`} style={{ width: `${percent}%` }} />
      </div>
      {psuWattage == null && (
        <div className={styles.hint}>
          {t('builder.recommended_psu')}: {wattage.recommendedPsu}W
        </div>
      )}
    </div>
  );
}
