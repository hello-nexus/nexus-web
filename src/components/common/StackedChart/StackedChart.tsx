import { useMemo, useState, useCallback, useLayoutEffect, useRef, type ReactNode } from 'react';
import type { SeriesEntry } from '../../../hooks/useProcessMonitor';
import { useChartHoverTooltip } from '../../../hooks/useChartHoverTooltip';
import { useUnitPrefs } from '../../../hooks/useUiSettings';
import { useTranslation } from '../../../lib/i18n';
import { localizeNumbers, type NumberFormat } from '../../../lib/units';
import { formatMemoryMb } from '../../../lib/formatMemory';
import styles from './StackedChart.module.scss';

interface StackedChartProps {
  title: string;
  /** Optional content docked on the right edge of the title row. */
  titleRight?: ReactNode;
  series: SeriesEntry[];
  sampleCount: number;
  /** Fixed Y max. If 0 or omitted, auto-scales. */
  yMax?: number;
  yUnit?: string;
  /** X axis window in seconds. Shows time labels. Default 60. */
  xSeconds?: number;
  /** Fixed pixel height. The width tracks the container. */
  height?: number;
}

const PAD = { left: 64, right: 12, top: 12, bottom: 24 };

// Pick a Y-axis tick step that produces "round" intermediate values and
// guarantees the top tick is the actual yMax. For binary units (MB) we also
// admit power-of-two steps so power-of-two memory sizes get clean axis ticks.
function niceYTicks(max: number, yUnit: string): number[] {
  if (!isFinite(max) || max <= 0) return [0];
  const binary = yUnit === 'MB';
  const candidates = new Set<number>();
  for (let order = -3; order <= 9; order++) {
    const mag = Math.pow(10, order);
    for (const b of [1, 2, 2.5, 4, 5, 8]) candidates.add(b * mag);
  }
  for (let p = 0; p <= 20; p++) candidates.add(Math.pow(2, p));

  let bestStep = max / 5;
  let bestScore = -Infinity;
  for (const step of candidates) {
    const count = max / step;
    if (count < 3 || count > 8) continue;
    const fits = Math.abs(count - Math.round(count)) < 0.01;
    const isPow2 = Math.abs(Math.log2(step) - Math.round(Math.log2(step))) < 0.001;
    const score = -Math.abs(count - 5) + (fits ? 2 : 0) + (binary && isPow2 ? 0.3 : 0);
    if (score > bestScore) { bestScore = score; bestStep = step; }
  }

  const ticks: number[] = [];
  const n = Math.floor(max / bestStep + 1e-9);
  for (let i = 0; i <= n; i++) ticks.push(i * bestStep);
  const last = ticks[ticks.length - 1];
  if (last < max - 1e-6) {
    if (max - last < bestStep * 0.4) ticks.pop();
    ticks.push(max);
  } else {
    ticks[ticks.length - 1] = max;
  }
  return ticks;
}

// Pick the precision that keeps the label readable without losing information.
// Integers print bare; otherwise one decimal is used when it preserves the
// value, two when finer precision is required.
function formatNum(v: number): string {
  if (Math.abs(v - Math.round(v)) < 1e-9) return String(Math.round(v));
  if (Math.abs(v - parseFloat(v.toFixed(1))) < 1e-6) return v.toFixed(1);
  return v.toFixed(2);
}

// Keep the unit consistent across all ticks: once yMax crosses into the larger
// unit, every label scales up so we never mix small and large units on one axis.
// Memory uses binary scaling (1 GiB = 1024 MiB); network rates use decimal
// scaling (1 MB/s = 1000 KB/s) to match how rates are normally reported.
function formatYLabel(val: number, yUnit: string, yMax: number, numberFormat: NumberFormat): string {
  if (yUnit === '%') return localizeNumbers(`${Math.round(val)}%`, numberFormat);
  if (yUnit === 'KB/s') {
    if (yMax >= 1000) return localizeNumbers(`${formatNum(val / 1000)} MB/s`, numberFormat);
    return localizeNumbers(`${formatNum(val)} KB/s`, numberFormat);
  }
  if (yMax >= 1024) return localizeNumbers(`${formatNum(val / 1024)} GB`, numberFormat);
  return localizeNumbers(`${formatNum(val)} MB`, numberFormat);
}

/**
 * Reusable stacked area chart. Used for CPU%, Memory MB, and Network KB/s.
 * Width tracks the container via ResizeObserver, height stays fixed.
 * Text and grid use pixel sizes that don't scale with width.
 */
export function StackedChart({
  title, titleRight, series, sampleCount, yMax: fixedMax, yUnit = '%', xSeconds = 60, height = 200,
}: StackedChartProps) {
  const { t } = useTranslation();
  const { numberFormat } = useUnitPrefs();
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(440);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const initialW = el.getBoundingClientRect().width;
    if (initialW > 0) setWidth(Math.round(initialW));
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width;
        if (w > 0) setWidth(Math.round(w));
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const chartW = width - PAD.left - PAD.right;
  const chartH = height - PAD.top - PAD.bottom;
  const n = sampleCount;
  const xStep = n > 1 ? chartW / (n - 1) : 0;

  const yMax = useMemo(() => {
    if (fixedMax && fixedMax > 0) return fixedMax;
    let max = 10;
    for (let i = 0; i < n; i++) {
      let sum = 0;
      for (const s of series) sum += (s.values[i] ?? 0);
      if (sum > max) max = sum;
    }
    return Math.ceil(max / 10) * 10 || 10;
  }, [series, n, fixedMax]);

  const areas = useMemo(() => {
    if (series.length === 0 || n < 2) return [];
    const ordered = [...series];

    const baselines: number[][] = [];
    for (let si = 0; si < ordered.length; si++) {
      baselines[si] = [];
      for (let i = 0; i < n; i++) {
        let below = 0;
        for (let j = 0; j < si; j++) below += (ordered[j].values[i] ?? 0);
        baselines[si][i] = below;
      }
    }

    return ordered.map((s, si) => {
      const topPts: string[] = [];
      const botPts: string[] = [];
      for (let i = 0; i < n; i++) {
        const x = PAD.left + i * xStep;
        const base = baselines[si][i];
        const val = s.values[i] ?? 0;
        const yTop = PAD.top + chartH - (Math.min(base + val, yMax) / yMax) * chartH;
        const yBot = PAD.top + chartH - (Math.min(base, yMax) / yMax) * chartH;
        topPts.push(`${x.toFixed(1)},${yTop.toFixed(1)}`);
        botPts.unshift(`${x.toFixed(1)},${yBot.toFixed(1)}`);
      }
      return { name: s.name, color: s.color, d: `M${topPts.join(' L')} L${botPts.join(' L')} Z` };
    });
  }, [series, n, xStep, chartH, yMax]);

  const tooltip = useMemo(() => {
    if (hoverIdx === null || series.length === 0) return null;
    const items = series
      .map(s => ({ name: s.name, color: s.color, val: s.values[hoverIdx] ?? 0 }))
      .filter(s => s.val > 0.05)
      .sort((a, b) => b.val - a.val);
    const total = items.reduce((sum, i) => sum + i.val, 0);
    return { items, total: Math.round(total * 10) / 10 };
  }, [hoverIdx, series]);

  const { tooltipRef, trackCursor } = useChartHoverTooltip(wrapRef, tooltip !== null);

  const onMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (n < 2) return;
    trackCursor(e);
    const rect = e.currentTarget.getBoundingClientRect();
    const svgX = ((e.clientX - rect.left) / rect.width) * width;
    const idx = Math.round((svgX - PAD.left) / xStep);
    setHoverIdx(Math.max(0, Math.min(n - 1, idx)));
  }, [n, xStep, width, trackCursor]);

  if (series.length === 0) {
    return (
      <div ref={wrapRef} className={styles.chartWrap}>
        <div className={styles.chartTitleRow}>
          <div className={styles.chartTitle}>{title}</div>
          {titleRight && <div className={styles.chartTitleRight}>{titleRight}</div>}
        </div>
        <div className={styles.empty}>{t('chart.waiting')}</div>
      </div>
    );
  }

  const hoverX = hoverIdx !== null ? PAD.left + hoverIdx * xStep : null;
  const yTicks = niceYTicks(yMax, yUnit);

  return (
    <div ref={wrapRef} className={styles.chartWrap}>
      <div className={styles.chartTitleRow}>
        <div className={styles.chartTitle}>{title}</div>
        {titleRight && <div className={styles.chartTitleRight}>{titleRight}</div>}
      </div>
      <svg className={styles.chart} width={width} height={height} viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        onMouseMove={onMouseMove} onMouseLeave={() => setHoverIdx(null)}>

        {yTicks.map((tickVal, i) => {
          const y = PAD.top + chartH * (1 - tickVal / yMax);
          return (
            <g key={i}>
              <line x1={PAD.left} y1={y} x2={width - PAD.right} y2={y}
                stroke="var(--border)" strokeWidth="0.5" />
              <text x={PAD.left - 4} y={y + 3} fill="var(--text-dim)"
                fontSize="11" fontFamily="var(--font-mono)" textAnchor="end">
                {formatYLabel(tickVal, yUnit, yMax, numberFormat)}
              </text>
            </g>
          );
        })}

        {/* X axis time labels - left is -60s, right is now */}
        {[60, 45, 30, 15, 0].map(sec => {
          const frac = 1 - sec / xSeconds;
          const x = PAD.left + frac * chartW;
          const label = sec === 0 ? t('chart.now') : `-${sec}s`;
          return (
            <text key={sec} x={x} y={PAD.top + chartH + 14}
              fill="var(--text-dim)" fontSize="11" fontFamily="var(--font-mono)"
              textAnchor="middle">
              {label}
            </text>
          );
        })}

        {areas.map(a => (
          <path key={a.name} d={a.d} fill={a.color} fillOpacity="0.5"
            stroke={a.color} strokeWidth="1" strokeOpacity="0.7" />
        ))}

        {hoverX !== null && (
          <line x1={hoverX} y1={PAD.top} x2={hoverX} y2={PAD.top + chartH}
            stroke="var(--text)" strokeWidth="1" strokeDasharray="3,3" opacity="0.5" />
        )}
      </svg>

      {tooltip && (
        <div ref={tooltipRef} className={styles.tooltip}>
          <div className={styles.tooltipHeader}>
            {yUnit === 'MB'
              ? t('chart.total', { value: formatMemoryMb(tooltip.total, numberFormat), unit: '' })
              : t('chart.total', { value: localizeNumbers(String(tooltip.total), numberFormat), unit: yUnit === '%' ? '%' : yUnit === 'KB/s' ? ' KB/s' : '' })}
          </div>
          {tooltip.items.map(item => (
            <div key={item.name} className={styles.tooltipRow}>
              <span className={styles.tooltipDot} style={{ background: item.color }} />
              <span className={styles.tooltipName}>{item.name === 'Other' ? t('monitoring.other') : item.name}</span>
              <span className={styles.tooltipVal}>
                {yUnit === '%' ? localizeNumbers(`${item.val.toFixed(1)}%`, numberFormat)
                  : yUnit === 'KB/s' ? localizeNumbers(item.val >= 1024 ? `${(item.val / 1024).toFixed(1)} MB/s` : `${Math.round(item.val)} KB/s`, numberFormat)
                  : formatMemoryMb(item.val, numberFormat)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
