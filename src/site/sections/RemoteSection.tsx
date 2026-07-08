import { useTranslation } from '../../lib/i18n';
import { Sparkline } from '../../components/common/Sparkline/Sparkline';
import { useInViewport } from '../hooks/useInViewport';
import { useTickingHistory } from '../hooks/useTickingHistory';
import { DemoFrame } from '../components/DemoFrame';
import styles from '../site.module.scss';

const QR_MODULES = 21;

// Finder-square test for the decorative QR: the three 7x7 corner patterns.
function inFinder(x: number, y: number): boolean {
  const corners: Array<[number, number]> = [[0, 0], [QR_MODULES - 7, 0], [0, QR_MODULES - 7]];
  return corners.some(([cx, cy]) => x >= cx && x < cx + 7 && y >= cy && y < cy + 7);
}

function finderRing(x: number, y: number): boolean {
  const corners: Array<[number, number]> = [[0, 0], [QR_MODULES - 7, 0], [0, QR_MODULES - 7]];
  for (const [cx, cy] of corners) {
    const lx = x - cx;
    const ly = y - cy;
    if (lx < 0 || lx > 6 || ly < 0 || ly > 6) continue;
    const onOuter = lx === 0 || lx === 6 || ly === 0 || ly === 6;
    const inCore = lx >= 2 && lx <= 4 && ly >= 2 && ly <= 4;
    return onOuter || inCore;
  }
  return false;
}

// Deterministic pseudo-noise so the decorative QR is stable across renders.
function dataModule(x: number, y: number): boolean {
  const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return h - Math.floor(h) > 0.52;
}

function DecorativeQr() {
  const cells: React.ReactNode[] = [];
  for (let y = 0; y < QR_MODULES; y++) {
    for (let x = 0; x < QR_MODULES; x++) {
      const on = inFinder(x, y) ? finderRing(x, y) : dataModule(x, y);
      if (on) cells.push(<rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} />);
    }
  }
  return (
    <svg viewBox={`0 0 ${QR_MODULES} ${QR_MODULES}`} className={styles.remoteQr} aria-hidden="true">
      {cells}
    </svg>
  );
}

export function RemoteSection() {
  const { t } = useTranslation();
  const [ref, inView] = useInViewport<HTMLElement>();
  const cpu = useTickingHistory(38, 16, { spike: 0.18, active: inView, intervalMs: 900 });
  const gpu = useTickingHistory(55, 10, { active: inView, intervalMs: 1100 });

  return (
    <section ref={ref} className={`${styles.section} ${styles.sectionFlipped}`}>
      <div className={styles.sectionText}>
        <p className={styles.eyebrow}>{t('site.remote.eyebrow')}</p>
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
          <div className={styles.remoteQrCard}>
            <DecorativeQr />
            <span className={styles.remoteQrLabel}>{t('site.remote.scanLabel')}</span>
          </div>
          <div className={styles.phoneFrame}>
            <div className={styles.phoneNotch} />
            <div className={styles.phoneScreen}>
              <div className={styles.phoneTile}>
                <span className={styles.phoneTileLabel}>{t('site.monitoring.cpuLabel')}</span>
                <span className={styles.phoneTileValue}>{cpu.value}%</span>
                <Sparkline values={cpu.history} width={132} height={34} sampleCount={60} />
              </div>
              <div className={styles.phoneTile}>
                <span className={styles.phoneTileLabel}>{t('site.monitoring.gpuLabel')}</span>
                <span className={styles.phoneTileValue}>{`${gpu.value}°C`}</span>
                <Sparkline values={gpu.history} width={132} height={34} sampleCount={60} />
              </div>
            </div>
          </div>
        </div>
      </DemoFrame>
    </section>
  );
}
