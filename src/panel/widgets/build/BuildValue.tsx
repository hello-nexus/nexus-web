import { useTranslation } from '../../../lib/i18n';
import { valueLines, type BuildValueView } from './buildValueData';
import styles from './BuildWidget.module.scss';

/** The PC's worth as the tile's headline: the owned figure, and the figure with upgrades beside it when something was added. */
export function BuildValue({ view, size }: { view: BuildValueView; size: string }) {
  const { language } = useTranslation();
  const v = valueLines(view, language);
  // The small tile keeps to the figures over the image.
  const overlay = size === '2x2';
  return (
    <div className={styles.value} data-overlay={overlay ? '' : undefined}>
      <div className={styles.figure}>
        <span className={styles.figureLabel}>{v.ownedLabel}</span>
        <span className={styles.figureAmount}>{v.owned}</span>
      </div>
      {v.upgraded && (
        <div className={styles.figure} data-upgraded="">
          <span className={styles.figureLabel}>{v.upgradedLabel}</span>
          <span className={styles.figureAmount}>{v.upgraded}</span>
          {!overlay && <span className={styles.figureDelta}>{v.delta}</span>}
        </div>
      )}
      {!overlay && (
        <span className={styles.valueNote}>
          <span>{v.asOf}</span>
          {v.unpriced && <span>{v.unpriced}</span>}
        </span>
      )}
    </div>
  );
}
