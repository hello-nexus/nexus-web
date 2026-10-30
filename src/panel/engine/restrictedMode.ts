import type { DeckAction } from '../widgets/deck/types';

// In Restricted mode (active while Windows is in OOBE) only these cells keep their own controls; every
// other widget renders but takes no input.
const RESTRICTED_WIDGET_TYPES: ReadonlySet<string> = new Set(['lighting', 'media', 'deck']);

export function restrictedAllowsWidget(type: string): boolean {
  return RESTRICTED_WIDGET_TYPES.has(type);
}

const RESTRICTED_SYSTEM_OPS: ReadonlySet<string> = new Set([
  'volumeUp', 'volumeDown', 'volumeSet', 'muteToggle', 'mediaPlayPause', 'mediaNext', 'mediaPrev',
]);
const RESTRICTED_NEXUS_OPS: ReadonlySet<string> = new Set([
  'rgbEffect', 'lightingBrightness', 'lightingBrightnessStep', 'lightingPowerToggle', 'lightingPreset',
]);

/** Lighting, media and volume keys, page navigation, and sequences or toggles made only of those. */
export function restrictedAllowsDeckAction(action: DeckAction): boolean {
  switch (action.type) {
    case 'system': return RESTRICTED_SYSTEM_OPS.has(action.action.op);
    case 'nexus': return RESTRICTED_NEXUS_OPS.has(action.action.op);
    case 'page':
    case 'pageIndicator':
      return true;
    case 'sequence': return action.steps.every(step => restrictedAllowsDeckAction(step.action));
    case 'toggle': return restrictedAllowsDeckAction(action.on) && restrictedAllowsDeckAction(action.off);
    default: return false;
  }
}
