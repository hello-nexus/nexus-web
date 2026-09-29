// Maps the service's capability grant strings (AppCapabilityGrants) to the
// labels the consent dialog shows.

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
  appData: 'store.consent.cap.appData',
  audio: 'store.consent.cap.audio',
  'rgb.read': 'store.consent.cap.rgbRead',
  'rgb.write': 'store.consent.cap.rgbWrite',
};

/**
 * The value after the first colon is community-authored (a host, a sensor
 * pattern, a path, an action name): it goes through interpolation into a JSX
 * text node only. An unrecognised grant falls back to its raw string so the
 * user still sees exactly what would be approved.
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
