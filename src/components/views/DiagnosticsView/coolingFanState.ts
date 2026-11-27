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

/** Null for a fan Cooling still tracks; control off wins over unresponsive. */
export function coolingFanStatus(channel: FanChannel): CoolingFanStatus | null {
  if (channel.controlled === false) return 'notControlled';
  return isFanUnresponsive(channel) ? 'notResponding' : null;
}

/** The excluded fan entries by rule id. A fan entry joins its channel by series id, `fan:<seriesId>`. */
export function excludedFanLinks(rules: readonly SensorAlertRule[], channels: readonly FanChannel[]): ReadonlyMap<string, CoolingFanLink> {
  const bySeries = new Map<string, FanChannel>();
  for (const ch of channels) if (ch.seriesId) bySeries.set(`fan:${ch.seriesId}`, ch);
  const links = new Map<string, CoolingFanLink>();
  for (const rule of rules) {
    const channel = rule.builtIn === 'fanSpeed' ? bySeries.get(builtInSeriesId(rule) ?? '') : undefined;
    const status = channel ? coolingFanStatus(channel) : null;
    if (channel && status) links.set(rule.id, { status, channelId: channel.id });
  }
  return links;
}

export const coolingFanStatusLabelKey = (status: CoolingFanStatus): string => `diagnostics.sensors.fan.${status}`;
