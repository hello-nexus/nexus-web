import type { FanChannel } from '../../../../api/cooling';

/**
 * Tooltip key for a pinned fan's pin icon. A GPU fan and a pump are the ones
 * the service pins by default (FanProfiles.IsPinnedByDefault), each for its
 * own reason; any other pin was the user's.
 */
export function pinTooltipKey(ch: Pick<FanChannel, 'isGpu' | 'kind'>): string {
  if (ch.isGpu) return 'cooling.pin.tipGpu';
  if (ch.kind === 'Pump') return 'cooling.pin.tipPump';
  return 'cooling.pin.tip';
}
