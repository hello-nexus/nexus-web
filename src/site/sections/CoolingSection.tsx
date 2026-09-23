import { useEffect, useState } from 'react';
import { Fan } from 'lucide-react';
import { useTranslation } from '../../lib/i18n';
import { CurveGraph } from '../../panel/widgets/cooling/page/CurveEditor';
import type { CurvePoint } from '../../api/cooling';
import { useInViewport } from '../hooks/useInViewport';
import { DemoFrame } from '../components/DemoFrame';
import styles from '../site.module.scss';

const START_POINTS: CurvePoint[] = [
  { temp: 30, speed: 20 },
  { temp: 55, speed: 40 },
  { temp: 75, speed: 80 },
  { temp: 90, speed: 100 },
];

// Piecewise-linear duty lookup over the demo's points (flat outside the ends) -
// the same evaluation the graph draws, kept local to the demo.
function dutyAt(points: CurvePoint[], temp: number): number {
  if (points.length === 0) return 0;
  const sorted = [...points].sort((a, b) => a.temp - b.temp);
  if (temp <= sorted[0].temp) return sorted[0].speed;
  const last = sorted[sorted.length - 1];
  if (temp >= last.temp) return last.speed;
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1];
    const b = sorted[i];
    if (temp <= b.temp) {
      const f = b.temp === a.temp ? 0 : (temp - a.temp) / (b.temp - a.temp);
      return a.speed + (b.speed - a.speed) * f;
    }
  }
  return last.speed;
}

export function CoolingSection() {
  const { t } = useTranslation();
  const [ref, inView] = useInViewport<HTMLElement>();
  const [points, setPoints] = useState<CurvePoint[]>(START_POINTS);
  const [preview, setPreview] = useState<CurvePoint[] | null>(null);
  const [temp, setTemp] = useState(52);

  // A slow thermal wander (sine + jitter) stands in for a live CPU sensor.
  useEffect(() => {
    if (!inView) return;
    let tick = 0;
    const id = setInterval(() => {
      tick += 1;
      setTemp(58 + 13 * Math.sin(tick / 7) + (Math.random() - 0.5) * 2.5);
    }, 1000);
    return () => clearInterval(id);
  }, [inView]);

  const activePoints = preview ?? points;
  const duty = Math.round(dutyAt(activePoints, temp));
  // Spin period tracks the demo duty (higher duty, faster spin).
  const spinSeconds = 40 / Math.max(duty, 8);

  return (
    <section ref={ref} className={styles.section}>
      <div className={styles.sectionText}>
        <p className={styles.eyebrow}>
          <Fan size={15} aria-hidden />
          <span>{t('welcome.capabilities.cooling')}</span>
        </p>
        <h2>{t('site.cooling.title')}</h2>
        <p className={styles.lead}>{t('site.cooling.lead')}</p>
        <ul className={styles.points}>
          <li>{t('site.cooling.point1')}</li>
          <li>{t('site.cooling.point2')}</li>
          <li>{t('site.cooling.point3')}</li>
        </ul>
        <p className={styles.hint}>{t('site.cooling.hint')}</p>
      </div>
      <DemoFrame className={styles.sectionDemo}>
        <div className={styles.coolingDemo}>
          <div className={styles.coolingReadout}>
            <div className={styles.coolingStat}>
              <span className={styles.coolingStatLabel}>{t('site.cooling.tempLabel')}</span>
              <span className={styles.coolingStatValue}>{`${Math.round(temp)}°C`}</span>
            </div>
            <div className={styles.coolingStat}>
              <span className={styles.coolingStatLabel}>{t('site.cooling.fanLabel')}</span>
              <span className={`${styles.coolingStatValue} ${styles.coolingStatAccent}`}>
                <Fan
                  size={20}
                  aria-hidden
                  className={styles.fanSpin}
                  style={{ animationDuration: `${spinSeconds.toFixed(2)}s` }}
                />
                {duty}%
              </span>
            </div>
          </div>
          <CurveGraph
            points={points}
            currentTemp={temp}
            editable
            height={230}
            onChange={next => { setPoints(next); setPreview(null); }}
            onPreview={setPreview}
          />
        </div>
      </DemoFrame>
    </section>
  );
}
