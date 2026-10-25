// Pure transform for the wireless Cooling tab: joins the bound fan chains
// from the wireless state with their matching generic-cooling channels. Kept
// free of React so it is unit-testable without mocking the API layer.

import type { FanChannel } from '../../../api/cooling';
import type { LianLiWirelessFan } from '../../../api/lianli-wireless';

// Matches Slv3CoolingProvider.IdPrefix / PortId in nexus-service.
export const WIRELESS_CHANNEL_PREFIX = 'lianli-wireless:';

/** The generic-cooling channel id the service registers for one port of a
 *  bound fan chain; the prefix names the handler that owns it. */
export function lianliWirelessPortChannelId(mac: string, port: number, prefix = WIRELESS_CHANNEL_PREFIX): string {
  return `${prefix}${mac}:port${port}`;
}

export interface LianLiWirelessCoolingPort {
  port: number;
  rpm: number;
  /** True when the controller drives this port but cannot report its RPM. */
  rpmUnavailable: boolean;
  /** Null until the /cooling/fans poll has a matching entry. */
  channel: FanChannel | null;
}

export interface LianLiWirelessCoolingChain {
  mac: string;
  fanType: number;
  ports: LianLiWirelessCoolingPort[];
}

/**
 * Groups the bound fan chains from the wireless state with their matching
 * generic cooling channels. A controller that does not enumerate its fans
 * reports fanCount 0 but the service still registers a channel per physical
 * port (flagged rpmUnavailable) so the ports stay controllable; the port
 * count therefore comes from the channels when present, falling back to
 * fanCount until the /cooling/fans poll catches up.
 */
export function buildLianLiWirelessCoolingChains(
  fans: readonly LianLiWirelessFan[],
  channels: readonly FanChannel[],
  prefix = WIRELESS_CHANNEL_PREFIX,
): LianLiWirelessCoolingChain[] {
  const byId = new Map<string, FanChannel>();
  for (const ch of channels) {
    if (ch.id.startsWith(prefix)) byId.set(ch.id, ch);
  }
  const chains: LianLiWirelessCoolingChain[] = [];
  for (const fan of fans) {
    if (!fan.boundToUs) continue;
    // The service registers contiguous port0..portN-1 channels per chain, so
    // the channel count doubles as the highest port index + 1.
    const chainChannelCount = channels.filter(
      ch => ch.id.startsWith(`${prefix}${fan.mac}:port`),
    ).length;
    // A P28 V2 has one duty channel for all its fans; each fan still gets an RPM row sharing it.
    const sharedChannel = fan.family === 'p28v2' ? byId.get(lianliWirelessPortChannelId(fan.mac, 0, prefix)) ?? null : null;
    const p28Count = fan.family === 'p28v2' ? Math.max(fan.fanCount, 1) : 0;
    const portCount = p28Count || (chainChannelCount > 0 ? chainChannelCount : fan.fanCount);
    if (portCount <= 0) continue;
    const ports: LianLiWirelessCoolingPort[] = [];
    for (let port = 0; port < portCount; port++) {
      const channel = p28Count ? sharedChannel : byId.get(lianliWirelessPortChannelId(fan.mac, port, prefix)) ?? null;
      ports.push({
        port,
        rpm: fan.rpm[port] ?? 0,
        rpmUnavailable: channel?.rpmUnavailable ?? fan.fanCount <= 0,
        channel,
      });
    }
    chains.push({ mac: fan.mac, fanType: fan.fanType, ports });
  }
  return chains;
}
