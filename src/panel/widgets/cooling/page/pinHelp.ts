import { isFanDisconnected, type FanChannel } from '../../../../api/cooling';

/** The fans a mode retargets (skipping pinned ones), or with `includePinned` the ones Off hands back. */
export const presetReach = (channels: readonly FanChannel[], includePinned = false): Set<string> => new Set(channels
  .filter(ch => (includePinned || !ch.pinned) && ch.controlled !== false && !ch.readOnly
    && ch.classification !== 'Fixed' && !isFanDisconnected(ch))
  .map(ch => ch.id));

/**
 * Tooltip key for a pinned fan's pin icon. A GPU fan, a pump and an AIO
 * channel are the ones the service pins by default (FanProfiles.IsPinnedByDefault),
 * each for its own reason; any other pin was the user's.
 */
export function pinTooltipKey(ch: Pick<FanChannel, 'isGpu' | 'kind' | 'isAio'>): string {
  if (ch.isGpu) return 'cooling.pin.tipGpu';
  if (ch.kind === 'Pump') return 'cooling.pin.tipPump';
  if (ch.isAio) return 'cooling.pin.tipAio';
  return 'cooling.pin.tip';
}
