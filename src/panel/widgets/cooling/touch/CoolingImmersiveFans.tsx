import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { CollapsibleSection } from '../../../../components/common/CollapsibleSection/CollapsibleSection';
import { useSensors } from '../../../../hooks/useSensors';
import { useTempSensorPrefs, useUnitPrefs } from '../../../../hooks/useUiSettings';
import { useTranslation } from '../../../../lib/i18n';
import { resolveCpuTempSensor, resolveGpuTempSensor } from '../../../../lib/tempSensorResolver';
import { localizeNumbers } from '../../../../lib/units';
import type { FanChannel } from '../../../../api/cooling';
import { MicroBar } from '../../monitoring/MicroBar';
import { CoolingTrendChart } from '../page/CoolingTrendChart';
import { formatFanRpm } from '../page/coolingTrendHelpers';
import { fanDeviceGroupName } from '../page/deviceGroupName';
import type { CoolingImmersiveController } from './useCoolingImmersive';
import pageStyles from '../CoolingPage.module.scss';
import styles from './CoolingImmersiveFans.module.scss';

// CoolingTrendChart's `height` prop sizes only the SVG; its legend row and
// frame padding stack on top. That chrome is measured live once the chart
// renders; this is only the pre-render fallback for the first pass.
const CHART_CHROME_FALLBACK_PX = 56;
const CHART_MIN_SVG_PX = 120;

/**
 * Immersive cell 2 (the fill cell): the live thermals chart, stretched to whatever
 * the read-only fan readout below leaves it. Per-fan control is the desktop page's.
 */
export function CoolingImmersiveFans({ cooling }: { cooling: CoolingImmersiveController }) {
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
        // A dead-band stops the measure -> render -> measure loop once the real
        // chrome has been read off the rendered chart.
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
    <div className={styles.fans}>
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
      {cooling.channels.length > 0 && (
        <div className={styles.list} data-panel-scrollable="true">
          <span className={pageStyles.curveFieldHeader}>{t('cooling.label.fan')}</span>
          <FanRows channels={cooling.channels} />
        </div>
      )}
    </div>
  );
}

function FanRows({ channels }: { channels: FanChannel[] }) {
  const { t } = useTranslation();
  const { numberFormat } = useUnitPrefs();
  // Collapse state is this view's own; the desktop rail lists the same groups with per-fan controls.
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const toggle = (key: string) =>
    setCollapsed(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);

  const row = (ch: FanChannel) => {
    const uncontrolled = ch.controlled === false;
    return (
      <div key={ch.id} className={styles.row} data-uncontrolled={uncontrolled ? 'true' : undefined}>
        <MicroBar
          // Bar = commanded duty, number = reported RPM; a chain with no tach shows the duty instead.
          label={uncontrolled ? `${ch.name} · ${t('cooling.fan.notControlled')}` : ch.name}
          formatted={ch.rpmUnavailable
            ? localizeNumbers(`${Math.round(ch.dutyPercent)}%`, numberFormat)
            : formatFanRpm(ch.rpm, true, numberFormat)}
          fillPercent={ch.dutyPercent}
        />
      </div>
    );
  };

  const groups = new Map<string | null, FanChannel[]>();
  for (const ch of channels) {
    const key = ch.deviceId || null;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(ch);
  }

  const blocks: ReactNode[] = [];
  // Motherboard / GPU fans first, flat (same shape as CoolingPage).
  const mobo = groups.get(null);
  if (mobo) for (const ch of mobo) blocks.push(row(ch));
  // Then one collapsible group per external hub, in stable order.
  const deviceKeys = Array.from(groups.keys()).filter((k): k is string => !!k).sort();
  for (const key of deviceKeys) {
    const list = groups.get(key)!;
    const deviceName = fanDeviceGroupName(key, list[0].deviceName);
    blocks.push(
      <CollapsibleSection
        key={key}
        compact
        title={deviceName}
        ariaLabel={deviceName}
        open={!collapsed.includes(key)}
        onToggle={() => toggle(key)}
        right={<span className={pageStyles.fanGroupCount}>{list.length}</span>}
      >
        <div className={styles.rows}>{list.map(row)}</div>
      </CollapsibleSection>,
    );
  }

  return <div className={styles.rows}>{blocks}</div>;
}
