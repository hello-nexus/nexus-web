import { useEffect, useMemo } from 'react';
import { GAUGE_DESIGNS, type GaugeDesignKey, type GaugeProps } from '../src/panel/widgets/monitoring/gauges';

// Harness-only tile: the real gauge components, one per 1x1 cell, so every
// design the monitoring widget offers can be seen under a skin at once.
const DESIGNS: GaugeDesignKey[] = [
  'sparkline', 'line', 'text', 'bar', 'hbar', 'microbars', 'segments', 'dotgrid',
  'halfgauge', 'arc270', 'tickring', 'dial', 'thermo', 'battery', 'wedge', 'caterpillar',
];

function walk(seed: number): number[] {
  const out: number[] = [];
  let v = 50;
  for (let i = 0; i < 48; i++) {
    v += (50 - v) * 0.15 + Math.sin(i * 0.9 + seed) * 9 + Math.sin(i * 0.31 + seed * 2) * 6;
    out.push(Math.max(5, Math.min(97, v)));
  }
  return out;
}

export function GaugeSampler() {
  const items = useMemo(() => DESIGNS.map((design, i) => {
    const history = walk(i);
    const percent = Math.round(history[history.length - 1]);
    const props: GaugeProps = {
      value: percent,
      rawValue: percent,
      formatted: `${percent}%`,
      label: 'CPU',
      history,
      maxValue: 100,
      historyDomain: [0, 100],
    };
    return { design, props };
  }), []);
  // Stand-in for the monitoring widget's data-value-state until it lands: two warn and two critical cells.
  useEffect(() => {
    const cells = document.querySelectorAll('[data-widget-type="gauge-sampler"]');
    const states: Record<number, string> = { 2: 'warn', 3: 'critical', 6: 'warn', 7: 'critical' };
    Object.entries(states).forEach(([i, state]) => {
      cells[Number(i)]?.querySelectorAll('[data-skin-part="value"], [data-skin-part="digit"]').forEach(el => el.setAttribute('data-value-state', state));
    });
  }, []);
  return (
    <>
      {items.map(({ design, props }, i) => {
        const Gauge = GAUGE_DESIGNS[design];
        return (
          <div
            key={design}
            className="panel-card"
            data-widget-type="gauge-sampler"
            style={{ gridColumn: `${(i % 4) + 1}`, gridRow: `${Math.floor(i / 4) + 1}`, minWidth: 0, minHeight: 0 }}
          >
            <div style={{ width: '100%', height: '100%', fontSize: 14 }}>
              <Gauge {...props} />
            </div>
          </div>
        );
      })}
    </>
  );
}
