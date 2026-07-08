import { Lightbulb, House, Gamepad2, Trophy, Hourglass, LayoutGrid } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useTranslation } from '../../lib/i18n';
import styles from '../site.module.scss';

const CARDS: Array<{ key: string; Icon: LucideIcon }> = [
  { key: 'smartlights', Icon: Lightbulb },
  { key: 'homeautomation', Icon: House },
  { key: 'gamesync', Icon: Gamepad2 },
  { key: 'widgets', Icon: LayoutGrid },
  { key: 'benchmarks', Icon: Trophy },
  { key: 'screentime', Icon: Hourglass },
];

export function MoreSection() {
  const { t } = useTranslation();
  return (
    <section className={styles.moreSection}>
      <div className={styles.moreHeading}>
        <p className={`${styles.eyebrow} ${styles.eyebrowCentered}`}>
          <LayoutGrid size={15} aria-hidden />
          <span>{t('welcome.capabilities.widgets')}</span>
        </p>
        <h2>{t('site.more.title')}</h2>
        <p className={styles.lead}>{t('site.more.lead')}</p>
      </div>
      <div className={styles.moreGrid}>
        {CARDS.map(({ key, Icon }) => (
          <div key={key} className={styles.moreCard}>
            <Icon size={22} className={styles.moreIcon} aria-hidden />
            <h3>{t(`site.more.${key}.title`)}</h3>
            <p>{t(`site.more.${key}.blurb`)}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
