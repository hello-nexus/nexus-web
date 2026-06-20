import { useLayoutEffect, useRef, useState } from 'react';
import { useSensors } from '../../../../hooks/useSensors';
import { useTempSensorPrefs } from '../../../../hooks/useUiSettings';
import { resolveCpuTempSensor, resolveGpuTempSensor } from '../../../../lib/tempSensorResolver';
import { useTranslation } from '../../../../lib/i18n';
import { COOLING_PRESETS } from '../page/coolingPresets';
import { CoolingTrendChart } from '../page/CoolingTrendChart';
import type { CoolingImmersiveController } from './useCoolingImmersive';
import styles from './CoolingImmersiveStatus.module.scss';

// CoolingTrendChart's `height` prop sizes only the SVG; its legend row and
// frame padding stack on top. That chrome is measured live once the chart
// renders; this is only the pre-render fallback for the first pass.
const CHART_CHROME_FALLBACK_PX = 56;
const CHART_MIN_SVG_PX = 120;

/**
 * Immersive cell 1: the five cooling preset buttons over the live thermals
 * trend chart, stretched to the cell.
 */
export function CoolingImmersiveStatus({ cooling }: { cooling: CoolingImmersiveController }) {
  const { t } = useTranslation();
  const sensors = useSensors(true);
  const tempPrefs = useTempSensorPrefs();
  const cpuTemp = resolveCpuTempSensor(sensors.cpu, tempPrefs.cpuId);
  const gpuTemp = resolveGpuTempSensor(sensors.gpu, tempPrefs.gpuId);

  const chartSlotRef = useRef<HTMLDivElement>(null);
  const [chartSvgHeight, setChartSvgHeight] = useState(0);
  useLayoutEffect(() => {
    const slot = chartSlotRef.current;
    if (!slot) return;
    const measure = () => {
      // offsetHeight, not getBoundingClientRect: the immersive render area is
      // inside the --panel-scale transform, so client rects come back in
      // visually-scaled px while the chart lays out in layout px. Mixing the
      // two oversizes the svg by the scale factor (clipped chart on the Y70's
      // 150% default).
      const slotH = slot.offsetHeight;
      const wrap = slot.firstElementChild as HTMLElement | null;
      const svg = wrap?.querySelector('svg');
      const chrome = wrap && svg
        ? wrap.offsetHeight - svg.clientHeight
        : CHART_CHROME_FALLBACK_PX;
      setChartSvgHeight(prev => {
        const next = Math.max(CHART_MIN_SVG_PX, Math.round(slotH - chrome));
        // 1px dead-band stops the measure -> render -> measure loop once the
        // real chrome has been read off the rendered chart.
        return Math.abs(next - prev) > 1 ? next : prev;
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(slot);
    // Also track the chart frame itself: its chrome height can change without
    // the slot resizing (the title row wraps once the chart's own width
    // measurement settles), and only a re-measure here can absorb that.
    if (slot.firstElementChild) ro.observe(slot.firstElementChild);
    return () => ro.disconnect();
    // Re-run after each height change so a freshly-mounted chart frame gets
    // observed and its real chrome replaces the pre-render estimate.
  }, [chartSvgHeight]);

  return (
    <div className={styles.status}>
      <div className={styles.modes}>
        {COOLING_PRESETS.map(p => {
          const active = cooling.activePreset === p.key;
          return (
            <button
              key={p.key}
              type="button"
              className={styles.modeBtn}
              data-active={active ? 'true' : 'false'}
              aria-pressed={active}
              aria-label={t(p.i18nKey)}
              onClick={() => cooling.applyPreset(p.key)}
            >
              <p.Icon size={20} aria-hidden />
            </button>
          );
        })}
      </div>
      <div ref={chartSlotRef} className={styles.chartSlot}>
        {chartSvgHeight > 0 && (
          <CoolingTrendChart
            cpuTempValue={cpuTemp?.value}
            gpuTempValue={gpuTemp?.value}
            channels={cooling.channels}
            height={chartSvgHeight}
            hideTitle
          />
        )}
      </div>
    </div>
  );
}
