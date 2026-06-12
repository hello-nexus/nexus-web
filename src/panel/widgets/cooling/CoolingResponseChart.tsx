import { useEffect, useMemo, useRef, useState } from 'react';
import { computeCurveSpeed } from './page/CurveEditor';
import type { CurveDef, FanState } from '../../../types/cooling';
import type { FanChannel, TemperatureSource } from '../../../api/cooling';
import { useTranslation } from '../../../lib/i18n';
import styles from './CoolingResponseChart.module.scss';

const TEMP_MIN = 20;
const TEMP_MAX = 100;
const SAMPLE_STEP = 2;
const PAD = { left: 6, right: 6, top: 22, bottom: 6 };

// BIOS fan curves aren't exposed via LibreHardwareMonitor / ACPI, so when
// every fan is hardware-controlled (no curves bound, no Manual channels) we
// approximate with the typical motherboard Q-Fan / Smart Fan "standard"
// profile. Piecewise-linear, precomputed once at module scope since the
// shape is constant.
const BIOS_FALLBACK_SAMPLES: ReadonlyArray<{ temp: number; speed: number }> = (() => {
  const pts = [
    { temp: 30, speed: 30 },
    { temp: 50, speed: 40 },
    { temp: 70, speed: 70 },
    { temp: 85, speed: 100 },
  ];
  const out: Array<{ temp: number; speed: number }> = [];
  for (let T = TEMP_MIN; T <= TEMP_MAX; T += SAMPLE_STEP) {
    if (T <= pts[0].temp) { out.push({ temp: T, speed: pts[0].speed }); continue; }
    const last = pts[pts.length - 1];
    if (T >= last.temp) { out.push({ temp: T, speed: last.speed }); continue; }
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      if (T <= b.temp) {
        const f = (T - a.temp) / (b.temp - a.temp);
        out.push({ temp: T, speed: a.speed + f * (b.speed - a.speed) });
        break;
      }
    }
  }
  return out;
})();

interface Props {
  curves: CurveDef[];
  fanStates: Record<string, FanState>;
  channels: FanChannel[];
  sources: TemperatureSource[];
  cpuTemp?: number;
  gpuTemp?: number;
  avgDuty?: number;
}

/**
 * Approximate "if all temps were at T" average fan duty across every
 * software-controlled fan. Sweeping the *unified* virtual temperature lets
 * any curve (regardless of its individual source) respond along a single
 * axis. Manual fans contribute a flat baseline at their current duty.
 */
export function CoolingResponseChart({
  curves, fanStates, channels, sources,
  cpuTemp, gpuTemp, avgDuty,
}: Props) {
  const { t } = useTranslation();
  const wrapRef = useRef<HTMLDivElement>(null);
  const fanReadoutRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(220);
  const [height, setHeight] = useState(72);
  const [fanReadoutWidth, setFanReadoutWidth] = useState(0);
  const hasFanReadout = typeof avgDuty === 'number';

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width > 0) setWidth(Math.round(rect.width));
    if (rect.height > 0) setHeight(Math.round(rect.height));
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(es => {
      for (const e of es) {
        const w = e.contentRect.width, h = e.contentRect.height;
        if (w > 0) setWidth(Math.round(w));
        if (h > 0) setHeight(Math.round(h));
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const el = fanReadoutRef.current;
    if (!el) {
      // When the FANS readout pill is hidden (avgDuty undefined), reset
      // the cached width so the notch-layout math doesn't keep clearing
      // space for a pill that isn't there.
       
      setFanReadoutWidth(0); return;
    }
    const measure = () => setFanReadoutWidth(Math.ceil(el.getBoundingClientRect().width));
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [hasFanReadout]);

  const { samples, isSynthetic } = useMemo(() => {
    const channelMap = new Map(channels.map(c => [c.id, c]));
    const pts: Array<{ temp: number; speed: number }> = [];

    for (let T = TEMP_MIN; T <= TEMP_MAX; T += SAMPLE_STEP) {
      const swept = sources.map(s => ({ ...s, value: T }));
      let sum = 0;
      let n = 0;

      for (const [fanId, state] of Object.entries(fanStates)) {
        if (!state.softwareControl) continue;
        if (state.curveId === null) {
          const ch = channelMap.get(fanId);
          if (ch) { sum += ch.dutyPercent; n += 1; }
        } else {
          const curve = curves.find(c => c.id === state.curveId);
          if (curve) { sum += computeCurveSpeed(curve, swept, curves); n += 1; }
        }
      }

      if (n > 0) pts.push({ temp: T, speed: Math.max(0, Math.min(100, sum / n)) });
    }

    if (pts.length > 0) return { samples: pts, isSynthetic: false };
    // Only fall back to the synthetic curve once the service has actually
    // reported the fan inventory — otherwise the initial mount (channels
    // empty, fanStates empty) would flash a dashed estimate over real data
    // for a frame before refreshCoolingConfig resolves.
    if (channels.length === 0) return { samples: [], isSynthetic: false };
    return { samples: BIOS_FALLBACK_SAMPLES.slice(), isSynthetic: true };
  }, [curves, fanStates, channels, sources]);

  if (samples.length === 0) {
    return (
      <div ref={wrapRef} className={styles.chart}>
        {hasFanReadout && (
          <div ref={fanReadoutRef} className={styles.fanReadout} aria-label={t('cooling.response.avgFanDuty')}>
            <span className={styles.fanLabel}>FANS</span>
            <span className={styles.fanValue}>{Math.round(avgDuty!)}%</span>
          </div>
        )}
      </div>
    );
  }

  const chartW = Math.max(1, width - PAD.left - PAD.right);
  const chartH = height - PAD.top - PAD.bottom;
  const tempToX = (t: number) => PAD.left + ((t - TEMP_MIN) / (TEMP_MAX - TEMP_MIN)) * chartW;
  const speedToY = (s: number) => PAD.top + chartH - (s / 100) * chartH;

  // Dense linear sampling (every 2 °C). Straight segments between ~40 points
  // read as a smooth curve at widget sizes; no spline math needed.
  const path = samples.map((p, i) => `${i === 0 ? 'M' : 'L'} ${tempToX(p.temp).toFixed(1)} ${speedToY(p.speed).toFixed(1)}`).join(' ');
  const first = samples[0], last = samples[samples.length - 1];
  const area = `${path} L ${tempToX(last.temp).toFixed(1)} ${speedToY(0).toFixed(1)} L ${tempToX(first.temp).toFixed(1)} ${speedToY(0).toFixed(1)} Z`;

  // Notch positions. Stagger order: FANS readout pins the top-right, so any
  // badge that would slide under it drops a row to clear it; then if CPU and
  // GPU still share a row horizontally, GPU drops one more.
  const cpuX = typeof cpuTemp === 'number' ? tempToX(Math.max(TEMP_MIN, Math.min(TEMP_MAX, cpuTemp))) : null;
  const gpuX = typeof gpuTemp === 'number' ? tempToX(Math.max(TEMP_MIN, Math.min(TEMP_MAX, gpuTemp))) : null;
  const BADGE_W = 52, BADGE_H = 15;
  const FANS_CLEAR_Y = 20; // clears .fanReadout (top: 2px, ~18px tall)
  const fansLeftX = fanReadoutWidth > 0 ? width - 6 - fanReadoutWidth - 4 : Infinity;
  const cpuClipsFans = cpuX !== null && cpuX + BADGE_W / 2 > fansLeftX;
  const gpuClipsFans = gpuX !== null && gpuX + BADGE_W / 2 > fansLeftX;
  const cpuBadgeY = cpuClipsFans ? FANS_CLEAR_Y : 0;
  let gpuBadgeY = gpuClipsFans ? FANS_CLEAR_Y : 0;
  if (cpuX !== null && gpuX !== null && Math.abs(cpuX - gpuX) < BADGE_W && cpuBadgeY === gpuBadgeY) {
    gpuBadgeY = cpuBadgeY + BADGE_H + 1;
  }

  const speedAtTemp = (t: number): number => {
    const clamped = Math.max(TEMP_MIN, Math.min(TEMP_MAX, t));
    const idx = (clamped - TEMP_MIN) / SAMPLE_STEP;
    const i0 = Math.max(0, Math.min(samples.length - 1, Math.floor(idx)));
    const i1 = Math.min(samples.length - 1, i0 + 1);
    const f = idx - i0;
    const a = samples[i0].speed;
    const b = samples[i1].speed;
    return a + (b - a) * f;
  };

  const renderNotch = (x: number | null, temp: number | undefined, label: string, badgeY: number) => {
    if (x === null || typeof temp !== 'number') return null;
    const curveY = speedToY(speedAtTemp(temp));
    const lineTop = badgeY + BADGE_H;
    return (
      <g className={styles.notch}>
        {curveY > lineTop && (
          <line x1={x} y1={lineTop} x2={x} y2={curveY} className={styles.notchLine} />
        )}
        <circle cx={x} cy={curveY} r={2.5} className={styles.notchDot} />
        <rect x={x - BADGE_W / 2} y={badgeY} width={BADGE_W} height={BADGE_H} rx="2" className={styles.notchBadge} />
        <text x={x} y={badgeY + BADGE_H - 4} className={styles.notchText} textAnchor="middle">
          <tspan className={styles.notchLabel}>{label}</tspan>
          <tspan className={styles.notchValue}> {Math.round(temp)}°</tspan>
        </text>
      </g>
    );
  };

  return (
    <div ref={wrapRef} className={styles.chart} data-synthetic={isSynthetic ? 'true' : undefined}>
      {hasFanReadout && (
        <div ref={fanReadoutRef} className={styles.fanReadout} aria-label={t('cooling.response.avgFanDuty')}>
          <span className={styles.fanLabel}>FANS</span>
          <span className={styles.fanValue}>{Math.round(avgDuty!)}%</span>
        </div>
      )}
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className={styles.svg}>
        <defs>
          <linearGradient id="cwResponseGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--panel-accent, var(--accent))" stopOpacity="0.35" />
            <stop offset="100%" stopColor="var(--panel-accent, var(--accent))" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {[25, 50, 75].map(s => (
          <line key={s}
            x1={PAD.left} y1={speedToY(s)}
            x2={width - PAD.right} y2={speedToY(s)}
            className={styles.gridLine} />
        ))}
        <path d={area} className={styles.area} fill="url(#cwResponseGrad)" />
        <path d={path} className={styles.line} fill="none" />

        {renderNotch(cpuX, cpuTemp, 'CPU', cpuBadgeY)}
        {renderNotch(gpuX, gpuTemp, 'GPU', gpuBadgeY)}
      </svg>
    </div>
  );
}
