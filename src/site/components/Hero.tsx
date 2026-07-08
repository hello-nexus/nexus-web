import { useMemo, useRef } from 'react';
import { useTranslation } from '../../lib/i18n';
import { NexusWordmark } from '../../components/icons/NexusBrand';
import { PlatformIcon } from '../../components/icons/PlatformIcons';
import { defaultStateFor } from '../../types/lighting';
import { DOWNLOAD_URLS, ALL_DOWNLOADABLE_OS, type DownloadableOS } from '../../lib/downloads';
import { detectOS } from '../../lib/platform';
import { mySystemHref } from '../mySystemUrl';
import { useInViewport } from '../hooks/useInViewport';
import { PlasmaCanvas } from './PlasmaCanvas';
import styles from '../site.module.scss';

// Ambient backdrop feel: slow drift in the blue/violet family; the scrim on
// top keeps the headline legible.
function heroState() {
  const s = defaultStateFor('plasma');
  s.speed = 14;
  s.hue = 0.62;
  s.colorize = 0.5;
  s.saturation = 0.9;
  return s;
}

export function Hero() {
  const { t } = useTranslation();
  const stateRef = useRef(heroState());
  const [ref, inView] = useInViewport<HTMLDivElement>({ threshold: 0.05 });
  const os: DownloadableOS = useMemo(() => {
    const detected = detectOS();
    return detected === 'unknown' ? 'windows' : detected;
  }, []);

  return (
    <div ref={ref} className={styles.hero}>
      <PlasmaCanvas stateRef={stateRef} active={inView} maxDevicePixelRatio={1} className={styles.heroPlasma} />
      <div className={styles.heroScrim} />
      <div className={styles.heroContent}>
        {/* Mark + wordmark, same stack as the app's onboarding screen. */}
        <img src="/nexus-mark-color.png" alt="" width={120} height={120} className={styles.heroMark} />
        <span className={styles.heroWordmark}>
          <NexusWordmark height={26} />
        </span>
        <h1 className={styles.heroTitle}>{t('site.hero.title')}</h1>
        <p className={styles.heroSubtitle}>{t('site.hero.subtitle')}</p>
        <div className={styles.heroCtas}>
          <a href={DOWNLOAD_URLS[os]} className={styles.ctaPrimary}>
            <span className={styles.ctaPlatforms}>
              {ALL_DOWNLOADABLE_OS.map(p => (
                <PlatformIcon key={p} platform={p} size={15} />
              ))}
            </span>
            {t('service.required.downloadFor', { os: t(`service.required.os.${os}`) })}
          </a>
          <a href={mySystemHref()} className={styles.ctaGhost}>{t('site.hero.ctaMySystem')}</a>
        </div>
        <a href="/download" className={styles.heroAllDownloads}>{t('site.nav.allDownloads')}</a>
        <p className={styles.heroMeta}>{t('site.download.free')}</p>
      </div>
    </div>
  );
}
