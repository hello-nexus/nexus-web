// Pure transform for the wireless Cooling tab: joins the bound fan chains
// from the wireless state with their matching generic-cooling channels. Kept
// free of React so it is unit-testable without mocking the API layer.

import type { FanChannel } from '../../../api/cooling';
import type { LianLiWirelessFan } from '../../../api/lianli-wireless';

// Matches Slv3CoolingProvider.IdPrefix / PortId in nexus-service.
const CHANNEL_PREFIX = 'lianli-wireless:';

/** The generic-cooling channel id the service registers for one port of a
 *  bound wireless fan chain. */
export function lianliWirelessPortChannelId(mac: string, port: number): string {
  return `${CHANNEL_PREFIX}${mac}:port${port}`;
}

export interface LianLiWirelessCoolingPort {
  port: number;
  rpm: number;
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
 * generic cooling channels. A chain with no matching channel yet (the
 * /cooling/fans poll hasn't caught up) still renders with `channel: null`
 * ports so the RPM readout (sourced from the wireless state, not the
 * channel) shows immediately.
 */
export function buildLianLiWirelessCoolingChains(
  fans: readonly LianLiWirelessFan[],
  channels: readonly FanChannel[],
): LianLiWirelessCoolingChain[] {
  const byId = new Map<string, FanChannel>();
  for (const ch of channels) {
    if (ch.id.startsWith(CHANNEL_PREFIX)) byId.set(ch.id, ch);
  }
  const chains: LianLiWirelessCoolingChain[] = [];
  for (const fan of fans) {
    if (!fan.boundToUs || fan.fanCount <= 0) continue;
    const ports: LianLiWirelessCoolingPort[] = [];
    for (let port = 0; port < fan.fanCount; port++) {
      ports.push({
        port,
        rpm: fan.rpm[port] ?? 0,
        channel: byId.get(lianliWirelessPortChannelId(fan.mac, port)) ?? null,
      });
    }
    chains.push({ mac: fan.mac, fanType: fan.fanType, ports });
  }
  return chains;
}
