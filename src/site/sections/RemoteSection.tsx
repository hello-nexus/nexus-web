import { lazy, Suspense } from 'react';
import { Smartphone, SatelliteDish, QrCode } from 'lucide-react';
import { useTranslation } from '../../lib/i18n';
import { useInViewport } from '../hooks/useInViewport';
import { DemoFrame } from '../components/DemoFrame';
import styles from '../site.module.scss';

const PhonePanelPreview = lazy(() =>
  import('../components/PhonePanelPreview').then(m => ({ default: m.PhonePanelPreview })));

export function RemoteSection() {
  const { t } = useTranslation();
  const [ref] = useInViewport<HTMLElement>();

  return (
    <section ref={ref} className={`${styles.section} ${styles.sectionFlipped}`}>
      <div className={styles.sectionText}>
        <p className={styles.eyebrow}>
          <Smartphone size={15} aria-hidden />
          <span>{t('welcome.capabilities.remote')}</span>
        </p>
        <h2>{t('site.remote.title')}</h2>
        <p className={styles.lead}>{t('site.remote.lead')}</p>
        <ul className={styles.points}>
          <li>{t('site.remote.point1')}</li>
          <li>{t('site.remote.point2')}</li>
          <li>{t('site.remote.point3')}</li>
        </ul>
      </div>
      <DemoFrame interactive={false} className={styles.sectionDemo}>
        <div className={styles.remoteDemo}>
          <div className={styles.remoteBadges}>
            <span className={styles.remoteBadge}><SatelliteDish size={22} aria-hidden /></span>
            <span className={styles.remoteBadge}><QrCode size={22} aria-hidden /></span>
          </div>
          <div className={styles.phoneFrame}>
            <span className={styles.phoneButtonAction} />
            <span className={styles.phoneButtonVolUp} />
            <span className={styles.phoneButtonVolDown} />
            <span className={styles.phoneButtonPower} />
            <div className={styles.phoneScreen}>
              <div className={styles.phoneIsland}>
                <span className={styles.phoneCamera} />
              </div>
              <Suspense fallback={<div className={styles.phonePanelLoading} />}>
                <PhonePanelPreview />
              </Suspense>
            </div>
          </div>
        </div>
      </DemoFrame>
    </section>
  );
}
