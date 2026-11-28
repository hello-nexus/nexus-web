import { isFanUnresponsive, type FanChannel } from '../../../api/cooling';
import type { SensorAlertRule } from '../../../api/diagnosticsAlerts';
import { builtInSeriesId } from './thermalsHelpers';

/** Why the Cooling page keeps a fan out of Diagnostics: Nexus control is off, or calibration read no tach signal. */
export type CoolingFanStatus = 'notControlled' | 'notResponding';

export interface CoolingFanLink {
  status: CoolingFanStatus;
  /** The Cooling page's channel id, what its selection takes. */
  channelId: string;
}

/** The service keeps a pump monitored whatever its control state, so a pump is never excluded. */
const isPump = (channel: FanChannel): boolean => channel.kind === 'Pump';

/** Null for a fan Cooling still tracks; control off wins over unresponsive. */
export function coolingFanStatus(channel: FanChannel): CoolingFanStatus | null {
  if (isPump(channel)) return null;
  if (channel.controlled === false) return 'notControlled';
  return isFanUnresponsive(channel) ? 'notResponding' : null;
}

/** The status of one fan entry. For an entry with a control channel the rule's `enabled` (Nexus Control plus any legacy mute) is the off state, the same value the switch shows; the channel then only adds "not responding". */
export function fanEntryStatus(rule: SensorAlertRule, channel: FanChannel): CoolingFanStatus | null {
  if (isPump(channel)) return null;
  if (rule.source?.controlChannel) {
    if (!rule.enabled) return 'notControlled';
    return isFanUnresponsive(channel) ? 'notResponding' : null;
  }
  return coolingFanStatus(channel);
}

/** The excluded fan entries by rule id. A fan entry joins its channel by series id, `fan:<seriesId>`. */
export function excludedFanLinks(rules: readonly SensorAlertRule[], channels: readonly FanChannel[]): ReadonlyMap<string, CoolingFanLink> {
  const bySeries = new Map<string, FanChannel>();
  for (const ch of channels) if (ch.seriesId) bySeries.set(`fan:${ch.seriesId}`, ch);
  const links = new Map<string, CoolingFanLink>();
  for (const rule of rules) {
    const channel = rule.builtIn === 'fanSpeed' ? bySeries.get(builtInSeriesId(rule) ?? '') : undefined;
    const status = channel ? fanEntryStatus(rule, channel) : null;
    if (channel && status) links.set(rule.id, { status, channelId: channel.id });
  }
  return links;
}

/** Monitoring history series ids (`fan:<seriesId>`) of the fan entries Cooling keeps out, from the same links the list and chart use. */
export function excludedFanSeriesIds(rules: readonly SensorAlertRule[], links: ReadonlyMap<string, CoolingFanLink>): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const rule of rules) {
    const id = links.has(rule.id) ? builtInSeriesId(rule) : null;
    if (id) ids.add(id);
  }
  return ids;
}

export const coolingFanStatusLabelKey = (status: CoolingFanStatus): string => (status === 'notControlled' ? 'cooling.fan.notControlled' : 'cooling.fan.unresponsive');
