import type { LightingDevice } from '../../../../api/lighting';
import type { LianLiWirelessFan, LianLiWirelessState } from '../../../../api/lianli-wireless';

export const UNBOUND_WIRELESS_PREFIX = 'lianli-wireless-unbound:';

/** On the air, bound to no controller; other-controller, wired-owned and USB-driven units are handled elsewhere. */
export function unboundWirelessFans(state: Pick<LianLiWirelessState, 'isConnected' | 'fans'> | null): LianLiWirelessFan[] {
  if (!state?.isConnected) return [];
  return state.fans.filter(f => !f.boundToUs && !f.wiredOwned && !f.usbConnected && !f.usbPresent && !f.masterMac);
}

/** Card stand-ins for those devices; ledCount 0 keeps every lighting control off them. */
export function unboundWirelessCards(
  fans: readonly LianLiWirelessFan[],
  labelOf: (fan: LianLiWirelessFan) => string,
): LightingDevice[] {
  const counts = new Map<string, number>();
  for (const f of fans) counts.set(labelOf(f), (counts.get(labelOf(f)) ?? 0) + 1);
  return fans.map(f => {
    const label = labelOf(f);
    return {
      id: `${UNBOUND_WIRELESS_PREFIX}${f.mac}`,
      name: (counts.get(label) ?? 0) > 1 ? `${label} ${f.mac.slice(-4)}` : label,
      ledsOn: false,
      controlled: false,
      ledCount: 0,
      canvasX: 0,
      canvasY: 0,
      canvasW: 0,
      canvasH: 0,
      canvasRotation: 0,
    };
  });
}
