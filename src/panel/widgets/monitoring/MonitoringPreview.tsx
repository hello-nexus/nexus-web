import { useMemo } from 'react';
import type { WidgetProps } from '../types';
import { GAUGE_DESIGNS } from './gauges';
import type { GaugeDesignKey, GaugeProps } from './gauges';
import type { DeviceKey } from './perfSlots';
import { prefixedSensorLabel } from './sensorNames';
import { getPanelSensorHist } from '../../../lib/monitoringStore';
import { PERF_HISTORY_SAMPLES } from '../common/panelHistoryConfig';
import styles from './MonitoringWidget.module.scss';

interface PreviewSlot {
  device: DeviceKey;
  sensor: string;
  design: GaugeDesignKey;
  // Center value the synthetic walk hovers around (percent) and its swing
  // amplitude.
  base: number;
  swing: number;
  // Per-sample chance of a sharp transient spike, so a CPU line reads busy
  // instead of a gentle sine. 0 = smooth mean-reverting walk.
  spike?: number;
  // Memory shows used-of-total GB to mirror the shipped `Memory Used` default;
  // when set, the gauge value is the GB amount and the arc is base%.
  totalGb?: number;
}

// Catalog preview composition mirrors the shipped default monitoring tile
// (install-defaults.json): CPU as a filled line, memory as a half gauge -
// the two side-by-side gauges that fill the 4x2 picker tile.
const PREVIEW_SLOTS: PreviewSlot[] = [
  { device: 'cpu',    sensor: 'CPU Total',   design: 'sparkline', base: 40, swing: 22, spike: 0.24 },
  { device: 'memory', sensor: 'Memory Used', design: 'halfgauge', base: 63, swing: 3, totalGb: 16 },
];

// Frozen, mean-reverting wiggle around `base` (so the line looks organic but
// the value stays near a believable percentage). Generated once per mount, so
// the preview never moves.
function synthHistory(base: number, swing: number, spike = 0): number[] {
  const out: number[] = [];
  let v = base;
  for (let i = 0; i < PERF_HISTORY_SAMPLES; i++) {
    v += (base - v) * 0.16 + (Math.random() - 0.5) * swing;
    // Occasional sharp transient (mostly upward) that the mean-reversion then
    // pulls back down over the next few samples, giving a spiky CPU profile.
    if (spike && Math.random() < spike) {
      v += Math.random() * 46 - 10;
    }
    v = Math.max(4, Math.min(98, v));
    out.push(Math.round(v));
  }
  return out;
}

function buildGauge(slot: PreviewSlot) {
  // Percent slots (CPU) reuse the last ~30 s of real telemetry the live panel
  // buffered, falling back to a synthetic walk. GB-scaled slots (Memory Used)
  // can't be read as a percent from that buffer, so they always synthesize.
  const live = slot.totalGb ? [] : getPanelSensorHist(`${slot.device}::${slot.sensor}`);
  const history = live.length >= 30
    ? live.slice(-PERF_HISTORY_SAMPLES).map(v => Math.round(v))
    : synthHistory(slot.base, slot.swing, slot.spike);
  const percent = Math.max(0, Math.min(100, history[history.length - 1] ?? slot.base));
  const formatted = slot.totalGb
    ? `${(slot.totalGb * percent / 100).toFixed(1)} GB`
    : `${Math.round(percent)}%`;
  const props: GaugeProps = {
    // Arc/fill always reads `value` as a percent; the GB amount only drives the
    // center text via `formatted`.
    value: percent,
    rawValue: percent,
    formatted,
    label: prefixedSensorLabel(slot.device, slot.sensor),
    history,
    maxValue: 100,
    historyDomain: [0, 100],
  };
  return { key: `${slot.device}-${slot.sensor}`, design: slot.design, props };
}

// Static, non-animated monitoring tile for the add-widget catalog. Builds its
// gauge data once on mount (no live sensor subscription) so the preview stays
// frozen and looks populated.
export function MonitoringPreview({ widget }: WidgetProps) {
  // 2x2 has no valid 2-gauge layout (slot options are 1 or micro 3/4, never 2),
  // so its default is a single solo gauge - show one sensor, not two squished
  // side-by-side. Larger tiles keep the CPU+memory pair.
  const solo = widget.size === '2x2';
  const slots = useMemo(
    () => (solo ? PREVIEW_SLOTS.slice(0, 1) : PREVIEW_SLOTS).map(buildGauge),
    [solo],
  );
  const layoutClass = solo
    ? styles.solo
    : widget.size === '4x4' || widget.size === '2x4'
      ? styles.grid2row
      : styles.grid2col;

  return (
    <div className={`${styles.performance} ${layoutClass}`}>
      {slots.map(({ key, design, props }) => {
        const Gauge = GAUGE_DESIGNS[design] ?? GAUGE_DESIGNS.sparkline;
        return (
          <div className={styles.slot} key={key}>
            <Gauge {...props} />
          </div>
        );
      })}
    </div>
  );
}
