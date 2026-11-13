import type { PanelDevicePatch } from '../../api/panel';
import {
  encodeSkinBackgroundMode,
  type PanelBackdrop,
  type PanelBackgroundBase,
  type PanelBackgroundMode,
  type SkinBackgroundHeld,
} from '../background/panelBackground';

// The background fields a Skin background takes over, and the user's own values it must give back.
export interface SkinBackgroundFields {
  backgroundMode: PanelBackgroundMode;
  backgroundModeBefore: PanelBackgroundBase;
  backdrop: PanelBackdrop;
  backgroundFrost: number;
  backgroundOpacity: number;
  backgroundHeld?: SkinBackgroundHeld | null;
}

export interface BackgroundSwitch {
  theme: Partial<SkinBackgroundFields>;
  patch: PanelDevicePatch;
}

// Entering Skin resets frost and opacity (both stay editable there) and remembers what it replaced.
export function enterSkinBackground(cur: SkinBackgroundFields): BackgroundSwitch {
  const inSkin = cur.backgroundMode === 'skin';
  const before = inSkin ? cur.backgroundModeBefore : cur.backgroundMode as PanelBackgroundBase;
  const held = inSkin
    ? cur.backgroundHeld ?? null
    : { backdrop: cur.backdrop, frost: cur.backgroundFrost, opacity: cur.backgroundOpacity };
  return {
    theme: { backdrop: 'theme', backgroundMode: 'skin', backgroundModeBefore: before, backgroundHeld: held, backgroundFrost: 0, backgroundOpacity: 1 },
    patch: { backdrop: 'theme', backgroundMode: encodeSkinBackgroundMode(before, held), backgroundFrostLevel: 0, backgroundOpacity: 1 },
  };
}

// Leaving Skin (skin removed, or another background chip picked) gives back the frost and opacity held, and the
// backdrop when the mode returns to the one that was held. Without held values only the mode changes.
export function leaveSkinBackground(cur: SkinBackgroundFields, to: PanelBackgroundBase | null = null): BackgroundSwitch {
  const mode = to ?? cur.backgroundModeBefore;
  const held = cur.backgroundHeld ?? null;
  if (!held) return { theme: { backgroundMode: mode, backgroundModeBefore: mode, backgroundHeld: null }, patch: { backgroundMode: mode } };
  const restoresBackdrop = mode === cur.backgroundModeBefore;
  const backdrop = restoresBackdrop ? held.backdrop : cur.backdrop;
  // A non-theme backdrop stays opaque, so a mode that does not bring it back does not inherit its opacity.
  const opacity = !restoresBackdrop && held.backdrop !== 'theme' ? 1 : held.opacity;
  return {
    theme: { backgroundMode: mode, backgroundModeBefore: mode, backgroundHeld: null, backdrop, backgroundFrost: held.frost, backgroundOpacity: opacity },
    patch: { backgroundMode: mode, backdrop, backgroundFrostLevel: held.frost, backgroundOpacity: opacity },
  };
}
