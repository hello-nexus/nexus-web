import { useRef } from 'react';
import { useTranslation } from '../../lib/i18n';
import { defaultStateFor } from '../../types/lighting';
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

  return (
    <div ref={ref} className={styles.hero}>
      <PlasmaCanvas stateRef={stateRef} active={inView} maxDevicePixelRatio={1} className={styles.heroPlasma} />
      <div className={styles.heroScrim} />
      <div className={styles.heroContent}>
        {/* eslint-disable-next-line i18next/no-literal-string -- decorative cursive glyph, same motif as the app icon */}
        <div className={styles.heroHello} aria-hidden="true">hello</div>
        <h1 className={styles.heroTitle}>{t('site.hero.title')}</h1>
        <p className={styles.heroSubtitle}>{t('site.hero.subtitle')}</p>
        <div className={styles.heroCtas}>
          <a href="#download" className={styles.ctaPrimary}>{t('site.hero.ctaDownload')}</a>
          <a href={mySystemHref()} className={styles.ctaGhost}>{t('site.hero.ctaMySystem')}</a>
        </div>
        <p className={styles.heroMeta}>{t('site.hero.platforms')}</p>
      </div>
    </div>
  );
}
