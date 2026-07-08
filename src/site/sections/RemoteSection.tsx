import { lazy, Suspense } from 'react';
import { Smartphone } from 'lucide-react';
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
          <div className={styles.phoneFrame}>
            <div className={styles.phoneNotch} />
            <Suspense fallback={<div className={styles.phonePanelLoading} />}>
              <PhonePanelPreview />
            </Suspense>
          </div>
        </div>
      </DemoFrame>
    </section>
  );
}
