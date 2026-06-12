import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { FanChannel } from '../../../../api/cooling';
import { useTranslation } from '../../../../lib/i18n';
import { PERF_HISTORY_SAMPLES } from '../../../../panel/widgets/common/panelHistoryConfig';
import { useTopicHistory } from '../../../../panel/widgets/common/useTopicHistory';
import {
  FAN_MIN_DOMAIN_MAX,
  averageFanRpm, fanDomainMax,
  formatAverageTemp, formatFanRpm,
} from './coolingTrendHelpers';
import styles from './CoolingTrendChart.module.scss';

const PAD = { left: 44, right: 44, top: 12, bottom: 22 };
// Y-axis floor so the chart doesn't visually jitter when both temps are
// idling low. Stacked CPU + GPU rarely sums above this on a healthy PC, so it
// also serves as the typical operating headroom.
const STACK_MIN_DOMAIN_MAX = 120;
const STACK_DOMAIN_STEP = 20;

interface Props {
  cpuTempValue: number | undefined;
  gpuTempValue: number | undefined;
  channels: FanChannel[];
  height?: number;
  /** Drop the title and let the legend own the row. The immersive cell is
   *  too narrow for both — the title wraps and eats chart height there. */
  hideTitle?: boolean;
}

/**
 * Page-sized cooling trend chart. Mirrors the monitoring StackedChart frame
 * (border + bg-card + rounded corners + title row) and renders three series
 * in one chart area: CPU temperature as the bottom filled layer (0 -> cpu),
 * GPU temperature stacked on top (cpu -> cpu+gpu) so the two never overlap,
 * and a dashed fan-RPM line on its own auto-stepping right-side domain.
 */
export function CoolingTrendChart({ cpuTempValue, gpuTempValue, channels, height = 140, hideTitle }: Props) {
  const { t } = useTranslation();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(440);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const initialW = el.getBoundingClientRect().width;
    if (initialW > 0) setWidth(Math.round(initialW));
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        const w = entry.contentRect.width;
        if (w > 0) setWidth(Math.round(w));
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fanValues = channels.map(c => c.rpm).filter(Number.isFinite);
  const hasFans = fanValues.length > 0;
  const fanValue = averageFanRpm(fanValues);

  // Each series advances exactly once per broadcast of its source topic.
  // No client-side timing, no value dedup — the backend's broadcast cadence
  // is the only thing that drives the chart.
  const cpuHistory = useTopicHistory('cpu', cpuTempValue ?? Number.NaN, PERF_HISTORY_SAMPLES);
  const gpuHistory = useTopicHistory('gpu', gpuTempValue ?? Number.NaN, PERF_HISTORY_SAMPLES);
  const fanHistory = useTopicHistory('cooling-realtime', hasFans ? fanValue : Number.NaN, PERF_HISTORY_SAMPLES);
  const fanMax = hasFans ? fanDomainMax(fanHistory, fanValue) : FAN_MIN_DOMAIN_MAX;

  const n = PERF_HISTORY_SAMPLES;

  // Walk both histories forward and pick a fill value (0 if missing). Padding
  // both to PERF_HISTORY_SAMPLES so the line stretches across the full window
  // even when only one of CPU/GPU has data.
  const { cpuPadded, gpuPadded, stackMax } = useMemo(() => {
    const cpuTail = cpuHistory.filter(Number.isFinite).slice(-n);
    const gpuTail = gpuHistory.filter(Number.isFinite).slice(-n);
    const cpuFill = cpuTail[0] ?? cpuTempValue ?? 0;
    const gpuFill = gpuTail[0] ?? gpuTempValue ?? 0;
    const cpu = [...new Array(n - cpuTail.length).fill(cpuFill), ...cpuTail];
    const gpu = [...new Array(n - gpuTail.length).fill(gpuFill), ...gpuTail];
    let observedMax = 0;
    for (let i = 0; i < n; i++) {
      const sum = (cpu[i] ?? 0) + (gpu[i] ?? 0);
      if (sum > observedMax) observedMax = sum;
    }
    const max = Math.max(STACK_MIN_DOMAIN_MAX, Math.ceil(observedMax / STACK_DOMAIN_STEP) * STACK_DOMAIN_STEP);
    return { cpuPadded: cpu, gpuPadded: gpu, stackMax: max };
  }, [cpuHistory, gpuHistory, cpuTempValue, gpuTempValue, n]);

  const fanPadded = useMemo(() => {
    if (!hasFans) return [] as number[];
    const tail = fanHistory.filter(Number.isFinite).slice(-n);
    const fill = tail[0] ?? fanValue;
    return [...new Array(n - tail.length).fill(fill), ...tail];
  }, [fanHistory, fanValue, hasFans, n]);

  const chartW = Math.max(1, width - PAD.left - PAD.right);
  const chartH = Math.max(1, height - PAD.top - PAD.bottom);
  const xStep = n > 1 ? chartW / (n - 1) : 0;

  const baseY = PAD.top + chartH;
  // Inlined helper used by both path useMemos. Kept here as a const so the
  // compiler treats the same expression identically across both blocks.
  const yFor = useCallback(
    (value: number) => baseY - (Math.max(0, value) / stackMax) * chartH,
    [baseY, stackMax, chartH],
  );

  // Bottom layer (CPU): filled-area between y=cpu and y=baseline; top edge
  // is the CPU line.
  const cpuPath = useMemo(() => {
    if (cpuPadded.length === 0) return { line: '', fill: '' };
    const linePts: string[] = [];
    for (let i = 0; i < cpuPadded.length; i++) {
      const x = PAD.left + i * xStep;
      linePts.push(`${x.toFixed(1)},${yFor(cpuPadded[i]).toFixed(1)}`);
    }
    const line = `M${linePts.join(' L')}`;
    const lastX = (PAD.left + (cpuPadded.length - 1) * xStep).toFixed(1);
    const firstX = PAD.left.toFixed(1);
    const fill = `${line} L${lastX},${baseY.toFixed(1)} L${firstX},${baseY.toFixed(1)} Z`;
    return { line, fill };
  }, [cpuPadded, xStep, baseY, yFor]);

  // Top layer (GPU): stacked above CPU. Filled-area runs between
  // y=cpu+gpu (top) and y=cpu (bottom) so it sits on top of the CPU layer
  // without overlapping.
  const gpuPath = useMemo(() => {
    if (gpuPadded.length === 0) return { line: '', fill: '' };
    const topPts: string[] = [];
    const botPts: string[] = [];
    for (let i = 0; i < gpuPadded.length; i++) {
      const x = PAD.left + i * xStep;
      const cpuValue = cpuPadded[i] ?? 0;
      const top = cpuValue + gpuPadded[i];
      topPts.push(`${x.toFixed(1)},${yFor(top).toFixed(1)}`);
      botPts.unshift(`${x.toFixed(1)},${yFor(cpuValue).toFixed(1)}`);
    }
    const line = `M${topPts.join(' L')}`;
    const fill = `M${topPts.join(' L')} L${botPts.join(' L')} Z`;
    return { line, fill };
  }, [gpuPadded, cpuPadded, xStep, yFor]);

  const fanLine = useMemo(() => {
    if (fanPadded.length === 0) return '';
    const pts: string[] = [];
    for (let i = 0; i < fanPadded.length; i++) {
      const x = PAD.left + i * xStep;
      const y = baseY - (Math.min(fanPadded[i], fanMax) / fanMax) * chartH;
      pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    }
    return `M${pts.join(' L')}`;
  }, [fanPadded, xStep, fanMax, baseY, chartH]);

  return (
    <div ref={wrapRef} className={styles.chartWrap}>
      <div className={styles.titleRow}>
        {!hideTitle && <span className={styles.title}>{t('cooling.trend.title')}</span>}
        <span className={`${styles.stats}${hideTitle ? ' ' + styles.statsFull : ''}`}>
          <span className={`${styles.stat} ${styles.statCpu}`}>
            <span className={styles.statSwatch} aria-hidden="true" />
            <span className={styles.statLabel}>{t('cooling.status.cpu')}</span>
            <span className={styles.statValue}>{formatAverageTemp(cpuTempValue)}</span>
          </span>
          <span className={`${styles.stat} ${styles.statGpu}`}>
            <span className={styles.statSwatch} aria-hidden="true" />
            <span className={styles.statLabel}>{t('cooling.status.gpu')}</span>
            <span className={styles.statValue}>{formatAverageTemp(gpuTempValue)}</span>
          </span>
          <span className={`${styles.stat} ${styles.statFan}`}>
            <span className={styles.statSwatch} aria-hidden="true" />
            <span className={styles.statValue}>{formatFanRpm(fanValue, hasFans)}</span>
          </span>
        </span>
      </div>
      <svg
        className={styles.chart}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {/* Horizontal gridlines + paired temp / RPM axis labels at quarter
            steps. Left axis = stacked CPU + GPU domain. Right axis = fan RPM
            auto-stepping domain. */}
        {[0, 0.25, 0.5, 0.75, 1].map(frac => {
          const y = baseY - frac * chartH;
          const tempLabel = `${Math.round(stackMax * frac)}°`;
          const rpmValue = fanMax * frac;
          const rpmLabel = rpmValue >= 1000 ? `${(rpmValue / 1000).toFixed(1)}k` : `${Math.round(rpmValue)}`;
          return (
            <g key={frac}>
              <line
                x1={PAD.left} y1={y}
                x2={width - PAD.right} y2={y}
                stroke="var(--border)" strokeWidth="0.5"
              />
              <text
                x={PAD.left - 6} y={y + 3}
                fill="var(--text-faded)"
                fontSize="11" fontFamily="var(--font-mono)"
                textAnchor="end"
              >
                {tempLabel}
              </text>
              <text
                x={width - PAD.right + 6} y={y + 3}
                fill="var(--text-faded)"
                fontSize="11" fontFamily="var(--font-mono)"
                textAnchor="start"
              >
                {rpmLabel}
              </text>
            </g>
          );
        })}

        {cpuPath.fill && (
          <path d={cpuPath.fill} fill="var(--accent)" fillOpacity="0.22" />
        )}
        {cpuPath.line && (
          <path
            d={cpuPath.line}
            fill="none" stroke="var(--accent)" strokeWidth="1.6"
            strokeLinecap="round" strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        )}
        {gpuPath.fill && (
          <path d={gpuPath.fill} fill="var(--accent-deep)" fillOpacity="0.28" />
        )}
        {gpuPath.line && (
          <path
            d={gpuPath.line}
            fill="none" stroke="var(--accent-deep)" strokeWidth="1.6"
            strokeLinecap="round" strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        )}
        {fanLine && (
          <path
            d={fanLine}
            fill="none" stroke="var(--accent-glow)" strokeWidth="1.6"
            strokeDasharray="3 3"
            strokeLinecap="round" strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        )}

        <text
          x={PAD.left} y={height - 6}
          fill="var(--text-faded)" fontSize="11" fontFamily="var(--font-mono)"
          textAnchor="start"
        >
          {t('chart.minus60s')}
        </text>
        <text
          x={width - PAD.right} y={height - 6}
          fill="var(--text-faded)" fontSize="11" fontFamily="var(--font-mono)"
          textAnchor="end"
        >
          {t('chart.now')}
        </text>
      </svg>
    </div>
  );
}
