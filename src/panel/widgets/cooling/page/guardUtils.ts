import type { CurveHazard, GuardResponse, GuardEffectiveLimitSource, HealChannel } from '../../../../api/cooling';

type Translate = (key: string, vars?: Record<string, string | number>) => string;

/** The guard has intervened or handed control back; "off" and "inactive" show nothing beyond the switch. */
export function guardBannerKey(guard: GuardResponse | null): string | null {
  if (!guard) return null;
  switch (guard.state) {
    case 'floor': return 'cooling.guard.banner.floor';
    case 'escalated': return 'cooling.guard.banner.escalated';
    case 'tripped':
      return guard.lastTrip?.reason === 'cooling-loss'
        ? 'cooling.guard.banner.tripLoss'
        : 'cooling.guard.banner.tripLimit';
    default: return null;
  }
}

const formatTemp = (c: number | null): string => (c == null ? '-' : String(Math.round(c)));

export function guardBannerText(guard: GuardResponse, t: Translate): string | null {
  const key = guardBannerKey(guard);
  if (!key) return null;
  return t(key, { temp: formatTemp(guard.guardTempC), limit: formatTemp(guard.limitC) });
}

const LIMIT_KEYS: Record<GuardEffectiveLimitSource, string> = {
  user: 'cooling.guard.limit.user',
  hardware: 'cooling.guard.limit.hardware',
  spec: 'cooling.guard.limit.spec',
  default: 'cooling.guard.limit.default',
};

/** One-line limit and where it came from; null until the service reports a limit. */
export function guardLimitText(guard: GuardResponse, t: Translate): string | null {
  if (guard.limitC == null) return null;
  return t(LIMIT_KEYS[guard.limitSource ?? 'default'], { temp: formatTemp(guard.limitC) });
}

const HAZARD_KEYS: Record<string, string> = {
  'follows-stoppable-source': 'cooling.guard.hazard.followsSource',
  'non-cpu-sensor': 'cooling.guard.hazard.nonCpuSensor',
  'low-ceiling': 'cooling.guard.hazard.lowCeiling',
  'manual-low': 'cooling.guard.hazard.manualLow',
};

/** Why one channel is listed, from the service's hazard kind. */
export function hazardText(
  channelName: string,
  kind: string,
  rootName: string | null | undefined,
  t: Translate,
): string {
  return t(HAZARD_KEYS[kind] ?? 'cooling.guard.hazard.generic', {
    channel: channelName,
    source: rootName || t('cooling.guard.hazard.unknownSource'),
  });
}

export const lintLines = (hazards: CurveHazard[], t: Translate): string[] =>
  hazards.map(h => hazardText(h.channelName, h.kind, h.rootName, t));

export const healLines = (channels: HealChannel[], t: Translate): string[] =>
  channels.map(c => hazardText(c.name, c.hazard, null, t));

/** Stable key for a hazard set, so a save that repeats an already-acknowledged warning does not ask again. */
export const hazardSignature = (hazards: CurveHazard[]): string =>
  hazards.map(h => `${h.channelId}:${h.kind}:${h.rootId ?? ''}`).sort().join('|');

/** A failure to show inline. `at` orders errors from different sources so the newest wins. */
export interface GuardErrorState {
  message: string;
  at: number;
  kind?: 'undo';
}

let errorStamp = 0;
export const newGuardError = (message: string, kind?: 'undo'): GuardErrorState => ({ message, at: ++errorStamp, kind });

/** The most recent of several errors, as text, or null when there are none. */
export const latestError = (...errors: Array<GuardErrorState | null>): string | null =>
  errors.reduce<GuardErrorState | null>((best, e) => (e && (!best || e.at > best.at) ? e : best), null)?.message ?? null;
