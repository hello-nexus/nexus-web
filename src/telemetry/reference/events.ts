// Documentation catalog for the product-telemetry events the app emits to
// PostHog. This is the human-readable mirror of the service's authoritative
// list in nexus-service `src/Telemetry/TelemetryEvents.cs` - keep `name`
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

// Properties PostHog attaches to EVERY event - you never pass these yourself.
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
    description: 'A cooling preset was applied from the panel (POST /cooling/profile/{name}) - the fan-mode widget.',
    params: [
      { name: 'preset', type: 'string', required: true, description: 'The applied preset - a built-in name (silent, balanced, turbo, …), a custom curve name, or "off".' },
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
      { name: 'transport', type: 'string', required: true, description: 'lan | relay - how the pairing claim reached the PC.' },
    ],
  },
  {
    name: 'install',
    title: 'Install',
    status: 'live',
    source: 'service',
    description: 'Delivered once per install id - reaches virtually every fresh install under the default-on consent default, plus existing opted-in installs once as a backfill on upgrade. Retried at boot and hourly until nexus-api acknowledges it (a persisted delivered flag prevents re-delivery); PostHog gets a single best-effort attempt alongside it. The nexus-api envelope additionally carries os, osVersion, arch, and deviceType.',
    params: [
      { name: 'version', type: 'string', required: true, description: 'Nexus build version (BuildInfo.Version).' },
    ],
  },
  {
    name: 'specs',
    title: 'Hardware specs',
    status: 'live',
    source: 'service',
    description: 'Fires once while opted in, then again only when the hardware summary hash changes (e.g. a component swap); skipped and retried next pass on a cold boot with no processor or GPU data yet. Upserts the latest snapshot per install id in nexus-api rather than appending, and reaches PostHog only once nexus-api has accepted it.',
    params: [
      { name: 'cpu', type: 'string', required: true, description: 'CPU model name.' },
      { name: 'gpu', type: 'string', required: false, description: 'GPU model name(s) as a JSON array; more than one entry on a multi-GPU system.' },
      { name: 'ram_bytes', type: 'number', required: true, description: 'Total installed RAM in bytes, derived from the parsed GB figure (an approximation, not an exact byte count).' },
      { name: 'motherboard', type: 'string', required: true, description: 'Motherboard model name.' },
    ],
  },
  {
    name: 'opt_out',
    title: 'Opted out',
    status: 'live',
    source: 'service',
    description: 'Fires on a true-to-false consent transition, from either the welcome screen or Settings. The one event still delivered after opting out: nexus-api retries it hourly until delivered once, and PostHog gets a single best-effort attempt alongside it. Appended, not deduped - the latest status wins.',
    params: [
      { name: 'version', type: 'string', required: true, description: 'Nexus build version at the time of the transition.' },
    ],
  },
  {
    name: 'opt_in',
    title: 'Opted in',
    status: 'live',
    source: 'service',
    description: 'Fires on a false-to-true consent transition from Settings, after a prior opt-out - not the initial welcome-screen confirmation, since posting the same value the fresh-install default already holds is not a transition. Delivered the same way as opt_out: nexus-api retries until it lands once, PostHog gets a single best-effort attempt. Appended, not deduped - the latest status wins.',
    params: [
      { name: 'version', type: 'string', required: true, description: 'Nexus build version at the time of the transition.' },
    ],
  },
];
