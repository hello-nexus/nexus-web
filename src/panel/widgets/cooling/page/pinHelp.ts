import { isFanDisconnected, type FanChannel } from '../../../../api/cooling';
import { pluralKey } from '../../../../lib/pluralKey';
import type { Language } from '../../../../lib/settings';

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

/**
 * Hover copy for a mode tab: the translation key and its params, or null when
 * nothing is pinned. Counts the pinned fans a mode would actually skip, so a
 * pinned fan Nexus does not control is not claimed. Off is not a mode tab (it
 * lives in the mode menu and releases every fan, pinned or not), so it never
 * gets this copy.
 */
export function modeTabTip(channels: readonly FanChannel[], language: Language): { key: string; params: { count: number } } | null {
  const all = presetReach(channels, true);
  const unpinned = presetReach(channels);
  const count = all.size - unpinned.size;
  if (count === 0) return null;
  return { key: pluralKey('cooling.pin.presetTipPinned', language, count), params: { count } };
}
