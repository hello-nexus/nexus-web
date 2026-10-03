// Maps an app manifest's capabilities to the permission labels its store page lists.

type Translate = (key: string, params?: Record<string, string | number>) => string;

/** Dispatch actions the service registers; each has its own label key. */
export const KNOWN_DISPATCH_ACTIONS: readonly string[] = [
  'app.install',
  'app.installStatus',
  'cooling.state',
  'devices.list',
  'displays.list',
  'displays.panelVariant',
  'displays.setBrightness',
  'lighting.setColor',
  'lighting.setMode',
  'lighting.state',
  'media.nowPlaying',
  'media.setVolume',
  'media.transport',
  'screentime.today',
  'system.openUrl',
  'system.specs',
];

const FLAG_KEYS: Record<string, string> = {
  'rgb.read': 'store.consent.cap.rgbRead',
  'rgb.write': 'store.consent.cap.rgbWrite',
  telemetry: 'store.consent.cap.telemetry',
};

const SCOPED_KINDS = ['dispatch', 'net.fetch', 'sensors.read', 'mediaImport'] as const;

/**
 * The permissions a manifest's capabilities request, as grant strings
 * (`dispatch:lighting.setMode`, `net.fetch:api.example.com`, `rgb.write`).
 * appData and audio are not permissions and never appear.
 */
export function capabilityGrants(caps: unknown): string[] {
  if (typeof caps !== 'object' || caps === null) return [];
  const fields = caps as Record<string, unknown>;
  const grants = new Set<string>();
  for (const kind of SCOPED_KINDS) {
    const values = fields[kind];
    if (!Array.isArray(values)) continue;
    for (const raw of values) {
      if (typeof raw !== 'string' || !raw.trim()) continue;
      const value = kind === 'net.fetch' ? raw.trim().toLowerCase() : raw.trim();
      grants.add(`${kind}:${value}`);
    }
  }
  for (const flag of Object.keys(FLAG_KEYS)) if (fields[flag] === true) grants.add(flag);
  return [...grants];
}

/**
 * The value after the first colon is community-authored (a host, a sensor
 * pattern, a path, an action name): it goes through interpolation into a JSX
 * text node only. An unrecognised grant falls back to its raw string.
 */
export function capabilityLabel(grant: string, t: Translate): string {
  const flagKey = FLAG_KEYS[grant];
  if (flagKey) return t(flagKey);
  const colon = grant.indexOf(':');
  if (colon < 0) return grant;
  const kind = grant.slice(0, colon);
  const value = grant.slice(colon + 1);
  switch (kind) {
    case 'dispatch':
      return KNOWN_DISPATCH_ACTIONS.includes(value)
        ? t(`store.consent.cap.${value}`)
        : t('store.consent.cap.dispatchUnknown', { action: value });
    case 'net.fetch': return t('store.consent.cap.netFetch', { host: value });
    case 'sensors.read': return t('store.consent.cap.sensorsRead', { pattern: value });
    case 'mediaImport': return t('store.consent.cap.mediaImport', { path: value });
    default: return grant;
  }
}
