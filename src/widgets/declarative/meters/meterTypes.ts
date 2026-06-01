// Meter palette type catalogue. Adding a meter:
//   1. Add an entry to MeterKind
//   2. Add a renderer file under ./meters/
//   3. Register in `renderer.tsx` switch
//
// The view object is loose: `WidgetView` declares `type: string` plus
// arbitrary keys. Each meter file declares its own narrow Props type; the
// renderer narrows by `view.type`.

export const METER_KINDS = [
  // Layout
  'vstack',
  'hstack',
  'grid',
  'frame',
  'box',
  'divider',
  'spacer',
  'conditional',
  'switch',
  'repeat',
  // Text
  'text',
  'value',
  'badge',
  // Iconography
  'icon',
  'image',
  'svg',
  // Indicators
  'ring',
  'bar',
  'range',
  'sparkline',
  'gauge',
  'slider',
  'button',
  'stepper',
  // Performance-gauge family: each takes value + formatted + label and renders
  // one style; the monitoring widget picks per-slot via settings.slotN_design.
  'water-level',
  'thermometer',
  'number-fill',
  'dot-grid',
  'microbars',
  'wedge',
] as const;

export type MeterKind = (typeof METER_KINDS)[number];

export function isMeterKind(value: string): value is MeterKind {
  return (METER_KINDS as readonly string[]).includes(value);
}
