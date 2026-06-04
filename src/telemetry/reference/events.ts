// Documentation catalog for the product-telemetry events the app emits to
// PostHog. This is the human-readable mirror of the service's authoritative
// list in nexus-service `src/Telemetry/TelemetryEvents.cs` — keep `name`
// values in sync with the constants there. Rendered at /telemetry-reference
// (Settings → Dev tools → Telemetry events).

export type TelemetryParamType = 'string' | 'number' | 'boolean';

export interface TelemetryParam {
  name: string;
  type: TelemetryParamType;
  required: boolean;
  description: string;
}

export interface TelemetryEventDoc {
  /** Event name sent to PostHog. Must match TelemetryEvents.cs. */
  name: string;
  title: string;
  /** 'live' = wired and emitting today. 'planned' = name reserved, not emitted yet. */
  status: 'live' | 'planned';
  /** Where the event originates. */
  source: 'service' | 'panel';
  /** What it records and when it fires. */
  description: string;
  params: TelemetryParam[];
}

// Properties PostHog attaches to EVERY event — you never pass these yourself.
export const AUTO_PROPERTIES: TelemetryParam[] = [
  { name: 'distinct_id', type: 'string', required: true, description: 'Anonymous per-install id (no PII). Shared with the fleet heartbeat.' },
  { name: '$lib', type: 'string', required: true, description: 'Always "nexus-service" for service-emitted events.' },
  { name: '$lib_version', type: 'string', required: true, description: 'Build version (BuildInfo.Version).' },
  { name: 'os', type: 'string', required: true, description: 'win | mac | linux | other.' },
];

export const TELEMETRY_EVENTS: TelemetryEventDoc[] = [
  {
    name: 'app_started',
    title: 'App started',
    status: 'live',
    source: 'service',
    description: 'Fires once per launch, after the service finishes startup. The DAU/launch primitive.',
    params: [],
  },
  {
    name: 'fan_speed_set',
    title: 'Fan speed set',
    status: 'live',
    source: 'service',
    description: 'A fan channel was set to a manual speed from the panel (POST /cooling/fan/{id}/speed).',
    params: [
      { name: 'speed', type: 'number', required: true, description: 'Resulting fan speed the hardware accepted (percent).' },
    ],
  },
  {
    name: 'device_connected',
    title: 'Device connected',
    status: 'planned',
    source: 'service',
    description: 'A recognized Nexus/HYTE device established a connection.',
    params: [
      { name: 'kind', type: 'string', required: true, description: 'Device family, e.g. np50, cnvs, y70, keeb.' },
    ],
  },
  {
    name: 'device_disconnected',
    title: 'Device disconnected',
    status: 'planned',
    source: 'service',
    description: 'A previously connected device dropped off the bus.',
    params: [
      { name: 'kind', type: 'string', required: true, description: 'Device family that disconnected.' },
    ],
  },
  {
    name: 'fan_curve_applied',
    title: 'Fan preset applied',
    status: 'live',
    source: 'service',
    description: 'A cooling preset was applied from the panel (POST /cooling/profile/{name}) — the fan-mode widget.',
    params: [
      { name: 'preset', type: 'string', required: true, description: 'The applied preset — a built-in name (silent, balanced, turbo, …), a custom curve name, or "off".' },
    ],
  },
  {
    name: 'lighting_effect_applied',
    title: 'Lighting effect applied',
    status: 'planned',
    source: 'service',
    description: 'An RGB effect was applied to a lighting zone.',
    params: [
      { name: 'effect', type: 'string', required: true, description: 'Effect id, e.g. static, breathing, rainbow.' },
    ],
  },
  {
    name: 'widget_opened',
    title: 'Widget opened',
    status: 'planned',
    source: 'panel',
    description: 'A dashboard widget was opened/expanded. Emitted by the panel through the service (loopback / relay), never a browser pixel.',
    params: [
      { name: 'widget', type: 'string', required: true, description: 'Widget type id.' },
    ],
  },
  {
    name: 'firmware_flashed',
    title: 'Firmware flashed',
    status: 'planned',
    source: 'service',
    description: 'A device firmware flash completed.',
    params: [
      { name: 'device', type: 'string', required: true, description: 'Device family flashed.' },
      { name: 'version', type: 'string', required: false, description: 'Firmware version written.' },
    ],
  },
  {
    name: 'pair_completed',
    title: 'Pair completed',
    status: 'planned',
    source: 'service',
    description: 'A phone successfully paired with this install.',
    params: [
      { name: 'transport', type: 'string', required: true, description: 'lan | relay — how the pairing claim reached the PC.' },
    ],
  },
];
