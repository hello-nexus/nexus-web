// Documentation catalog for the product-telemetry events the app emits to
// PostHog. This is the human-readable mirror of the service's authoritative
// list in nexus-service `src/Telemetry/TelemetryEvents.cs` - keep `name`
// values in sync with the constants there. Rendered at /telemetry-reference
// (Settings → Dev tools → Telemetry events).

export type TelemetryParamType = 'string' | 'number' | 'boolean' | 'array';

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

// Attached to the anonymous person via PostHog $set (never to a single
// event), refreshed only when the value actually changes. The hardware half
// is what makes every event above breakable down by machine; the usage half
// is the current-state census that layout_snapshot mirrors over time.
//
// The hardware half carries vendor model-name strings (cpu, gpu, monitor and
// the devices list) - reported by the hardware itself, never typed by the
// user. The usage half is counts and fixed values only. Nothing the user
// authored is collected in either: widget titles, renamed devices, panel
// display names, file paths and serials are all excluded.
export const PERSON_PROPERTIES: TelemetryParam[] = [
  { name: 'version', type: 'string', required: true, description: 'Nexus build version (BuildInfo.Version).' },
  { name: 'os', type: 'string', required: true, description: 'win | mac | linux | other.' },
  { name: 'os_build', type: 'string', required: false, description: 'Operating-system build string.' },
  { name: 'cpu', type: 'string', required: false, description: 'CPU model name.' },
  { name: 'gpu', type: 'string', required: false, description: 'GPU model name(s).' },
  { name: 'ram', type: 'string', required: false, description: 'Installed RAM as reported (the raw string; ram_amount is the parsed figure).' },
  { name: 'ram_amount', type: 'number', required: false, description: 'Installed RAM in GB, parsed from ram. Absent when the string does not parse.' },
  { name: 'motherboard', type: 'string', required: false, description: 'Motherboard model name.' },
  { name: 'storage', type: 'string', required: false, description: 'Storage as reported (the raw string; storage_amount is the parsed figure).' },
  { name: 'storage_amount', type: 'number', required: false, description: 'Total storage in GB, parsed from storage. Absent when the string does not parse.' },
  { name: 'monitor', type: 'string', required: false, description: 'Monitor model name(s).' },
  { name: 'network', type: 'string', required: false, description: 'Network adapter model name(s).' },
  { name: 'sound', type: 'string', required: false, description: 'Sound device model name(s).' },
  { name: 'devices', type: 'array', required: true, description: 'Recognized connected devices by model name, sorted (capped at 80). Always sent, possibly empty.' },
  { name: 'lighting_devices', type: 'number', required: false, description: 'Lighting cards currently enumerated - one entry per motherboard ARGB zone, including disabled devices, so higher than a count of physical products. Omitted when the provider read failed rather than reported as 0, because person properties are last-write-wins.' },
  { name: 'cooling_channels', type: 'number', required: false, description: 'Fan channels currently enumerated. Omitted on a failed read rather than reported as 0.' },
  { name: 'panel_devices', type: 'number', required: true, description: 'Configured panel devices.' },
  { name: 'panel_surfaces', type: 'array', required: true, description: 'Distinct panel surfaces in use.' },
  { name: 'widget_count', type: 'number', required: true, description: 'Total widget placements.' },
  { name: 'widget_page_count', type: 'number', required: true, description: 'Total panel pages.' },
  { name: 'widget_types', type: 'array', required: true, description: 'Distinct widget type keys placed, capped at 200. Keys that are neither a plain lowercase slug nor a valid app id are dropped at the send boundary.' },
  { name: 'lighting_mode', type: 'string', required: true, description: 'simple | advanced. Seeded to advanced for pre-existing installs by the v15 migration, so read dashboard_mode_changed for actual preference.' },
  { name: 'cooling_mode', type: 'string', required: true, description: 'simple | advanced. Same migration caveat as lighting_mode.' },
  { name: 'features_off', type: 'array', required: true, description: 'Feature pillars switched off; empty for most installs.' },
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
    status: 'live',
    source: 'service',
    description: 'A lighting look was applied, from any of the three headless-start routes. Deduped on mode plus effect, so the ~30 posts/second a slider drag produces cost nothing and only a real change is recorded; stopping lighting clears the dedupe, so restarting the same look reports again. The count is therefore transitions, not time spent.',
    params: [
      { name: 'mode', type: 'string', required: true, description: 'animate | static | screen - the mode the service actually ran, which is not always the route it arrived on: a static-catalog key posted to the animate route is rerouted into Static and reported as static.' },
      { name: 'effect', type: 'string', required: true, description: 'Effect key, lowercased the same way the provider lowercases it before matching (e.g. plasma, fire, gradientlinear). Defaults are filled in as the service applies them - an animate start with no key runs rainbow. Anything outside the lowercase slug alphabet reports as "other". Always "screen" in screen mode, where the service ignores the field.' },
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
    name: 'layout_snapshot',
    title: 'Layout snapshot',
    status: 'live',
    source: 'service',
    description: 'A census of what this install actually runs: which widget types are placed, across how many panels and pages. Panel widgets are persistent rather than opened, so a census answers "which widgets are used most" where a click count cannot. Fires on the first ready snapshot after each service start, then at most once every 24h - so a restart-heavy machine emits more than one a day, and the event is NOT a per-day unit. Carries the same fields as the usage person properties, so the census is readable as a trend over time.',
    params: [
      { name: 'widget_types', type: 'array', required: true, description: 'Distinct widget type keys placed anywhere, sorted, capped at 200. An SDK app appears as its app id, e.g. app:com.hellonexus.aquarium. Re-validated at the send boundary: a key that is neither a plain lowercase slug nor a valid app id is dropped from this list (it still counts toward widget_count), so no unrecognised text can ride along.' },
      { name: 'widget_count', type: 'number', required: true, description: 'Total widget placements across every panel and page.' },
      { name: 'widget_page_count', type: 'number', required: true, description: 'Total pages across every panel.' },
      { name: 'panel_devices', type: 'number', required: true, description: 'Number of configured panel devices.' },
      { name: 'panel_surfaces', type: 'array', required: true, description: 'Distinct panel surfaces in use, sorted, e.g. y70, q60, monitor.' },
      { name: 'lighting_devices', type: 'number', required: false, description: 'Lighting cards currently enumerated - what the lighting page lists, which is one entry per motherboard ARGB zone and includes disabled devices, so it runs higher than a count of physical products. Omitted entirely when the provider read failed, rather than reported as 0.' },
      { name: 'cooling_channels', type: 'number', required: false, description: 'Fan channels currently enumerated. Omitted when the provider read failed, rather than reported as 0.' },
      { name: 'lighting_mode', type: 'string', required: true, description: 'simple | advanced - the lighting page density.' },
      { name: 'cooling_mode', type: 'string', required: true, description: 'simple | advanced - the cooling page density.' },
      { name: 'features_off', type: 'array', required: true, description: 'Feature pillars switched OFF. Every pillar defaults on, so this is empty for most installs.' },
    ],
  },
  {
    name: 'dashboard_mode_changed',
    title: 'Dashboard mode changed',
    status: 'live',
    source: 'service',
    description: 'The lighting or cooling page was switched between simple and advanced (POST /preferences). Only fires on an actual transition. This is the only trustworthy measure of preference: the v15 settings migration seeded every pre-existing install to "advanced", so the current value alone cannot tell a deliberate choice from a migration default.',
    params: [
      { name: 'surface', type: 'string', required: true, description: 'lighting | cooling - which page was switched.' },
      { name: 'from', type: 'string', required: true, description: 'The mode before the switch.' },
      { name: 'to', type: 'string', required: true, description: 'The mode after the switch.' },
    ],
  },
  {
    name: 'onboarding_completed',
    title: 'Onboarding completed',
    status: 'live',
    source: 'service',
    description: 'The first-run welcome sequence finished (POST /onboarding/complete). Fires at most once per install - a repeat post finds the flag already set. Paired with the hardware person properties, this is the activation signal: which machines get through setup.',
    params: [],
  },
  {
    name: 'widget_added',
    title: 'Widget added',
    status: 'planned',
    source: 'service',
    description: 'A widget was placed on a panel. Reserved to pair with widget_removed so adoption can be told apart from retention - what people try versus what they keep. Not wired yet; layout_snapshot covers the census in the meantime.',
    params: [
      { name: 'widget', type: 'string', required: true, description: 'Widget type key.' },
      { name: 'surface', type: 'string', required: true, description: 'Panel surface it was added to.' },
    ],
  },
  {
    name: 'widget_removed',
    title: 'Widget removed',
    status: 'planned',
    source: 'service',
    description: 'A widget was removed from a panel. The other half of widget_added. Not wired yet.',
    params: [
      { name: 'widget', type: 'string', required: true, description: 'Widget type key.' },
      { name: 'surface', type: 'string', required: true, description: 'Panel surface it was removed from.' },
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
      { name: 'gpu', type: 'array', required: false, description: 'GPU model name(s); more than one entry on a multi-GPU system.' },
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
