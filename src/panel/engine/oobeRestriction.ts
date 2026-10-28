import type { DeckAction } from '../widgets/deck/types';

// While Windows is in OOBE only these cells keep their own controls; every
// other widget renders but takes no input.
const OOBE_WIDGET_TYPES: ReadonlySet<string> = new Set(['lighting', 'media', 'deck']);

export function oobeAllowsWidget(type: string): boolean {
  return OOBE_WIDGET_TYPES.has(type);
}

const OOBE_SYSTEM_OPS: ReadonlySet<string> = new Set([
  'volumeUp', 'volumeDown', 'volumeSet', 'muteToggle', 'mediaPlayPause', 'mediaNext', 'mediaPrev',
]);
const OOBE_NEXUS_OPS: ReadonlySet<string> = new Set([
  'rgbEffect', 'lightingBrightness', 'lightingBrightnessStep', 'lightingPowerToggle', 'lightingPreset',
]);

/** Lighting, media and volume keys, page navigation, and sequences or toggles made only of those. */
export function oobeAllowsDeckAction(action: DeckAction): boolean {
  switch (action.type) {
    case 'system': return OOBE_SYSTEM_OPS.has(action.action.op);
    case 'nexus': return OOBE_NEXUS_OPS.has(action.action.op);
    case 'page':
    case 'pageIndicator':
      return true;
    case 'sequence': return action.steps.every(step => oobeAllowsDeckAction(step.action));
    case 'toggle': return oobeAllowsDeckAction(action.on) && oobeAllowsDeckAction(action.off);
    default: return false;
  }
}
