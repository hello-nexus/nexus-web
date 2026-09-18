import { PERF_HISTORY_SAMPLES } from '../../common/panelHistoryConfig';
import { GaugeValue } from './GaugeValue';
import type { GaugeProps } from './types';
import styles from './MirrorWaveGauge.module.scss';

const VIEW_W = 160;
const VIEW_H = 40;
const CENTER = VIEW_H / 2;
const EDGE_PAD = 3;

// Symmetric level-meter trace: each sample's normalized amplitude is drawn both
// above and below the center line, filled as one mirrored shape.
export function MirrorWaveGauge({ formatted, label, history, historyDomain, gradient }: GaugeProps) {
  const tail = history.slice(-PERF_HISTORY_SAMPLES);
  const samples =
    tail.length >= PERF_HISTORY_SAMPLES
      ? tail
      : [...new Array(PERF_HISTORY_SAMPLES - tail.length).fill(0), ...tail];

  const [min, max] = historyDomain;
  const range = max - min || 1;
  const stepX = samples.length > 1 ? VIEW_W / (samples.length - 1) : 0;
  const maxAmp = CENTER - EDGE_PAD;

  const pts = samples.map((v, i) => {
    const norm = Math.max(0, Math.min(1, (v - min) / range));
    return { x: i * stepX, amp: norm * maxAmp };
  });

  const top = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${(CENTER - p.amp).toFixed(2)}`);
  const bottom = [...pts]
    .reverse()
    .map(p => `L${p.x.toFixed(2)},${(CENTER + p.amp).toFixed(2)}`);
  const path = `${top.join(' ')} ${bottom.join(' ')} Z`;

  return (
    <div className={styles.wave}>
      <div className={styles.chart}>
        <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} preserveAspectRatio="none" aria-hidden="true">
          {gradient && (
            // Amplitude is the level, so the ramp runs from the centre line
            // out to either edge: the same stops mirrored about the middle.
            <defs>
              <linearGradient id={gradient.id} gradientUnits="userSpaceOnUse" x1="0" x2="0" y1={CENTER + maxAmp} y2={CENTER - maxAmp}>
                {[...gradient.stops].reverse().map((stop, i) => (
                  <stop key={`b${i}`} offset={(1 - stop.at) / 2} stopColor={stop.color} />
                ))}
                {gradient.stops.map((stop, i) => (
                  <stop key={`t${i}`} offset={0.5 + stop.at / 2} stopColor={stop.color} />
                ))}
              </linearGradient>
            </defs>
          )}
          <path
            className={styles.fill}
            d={path}
            style={gradient ? { fill: `url(#${gradient.id})`, fillOpacity: 0.4, stroke: `url(#${gradient.id})` } : undefined}
          />
        </svg>
      </div>
      <div className={styles.info}>
        <GaugeValue formatted={formatted} className={styles.value} />
        {label && <span className={styles.label}>{label}</span>}
      </div>
    </div>
  );
}

export default MirrorWaveGauge;
