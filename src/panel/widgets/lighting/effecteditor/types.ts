import type { EffectState, EffectTemplateBundle } from '../../../../types/lighting';

/**
 * Post-process params shared by Mirror and Media modes: hue shift, colorize
 * (0 = pure hue rotate, 1 = grayscale + tint), saturation (0 = mono, 1 =
 * unchanged, up to 4 = oversaturated), contrast (same range), plus optional
 * X/Y flip toggles (geometric, applied before colour transform) and reactive
 * mode fields (reactive selects the Reactive render path on the service).
 */
export interface PostProcessState {
  hue: number;
  colorize: number;
  saturation: number;
  contrast: number;
  flipX?: boolean;
  flipY?: boolean;
  reactive?: boolean;
  reactivity?: number;
  intensity?: number;
}

/**
 * The contract the animate Options + Effect bodies consume. Both the immersive
 * (global RGB lighting) and panel-background (per-panel) call sites build one
 * of these from their own data source; the shared EffectEditor and the leaf
 * components (AnimateGrid, EffectControls) never branch on which target it is.
 */
export interface AnimateController {
  effect: string;
  state: EffectState;
  bundle: EffectTemplateBundle;
  canReset: boolean;
  /** Options-tab effect (shader) selection. */
  onSelectEffect: (key: string) => void;
  onTemplateSelect: (idx: number) => void;
  onChange: (patch: Partial<EffectState>, commit?: boolean) => void;
  onCommit: () => void;
  onReset: () => void;
  /** Preset slot each effect's grid cell shows (this surface's selection). */
  slotFor: (key: string) => number;
  /** Content hash of that slot, for thumbnail cache-busting. */
  versionFor: (key: string) => string;
  /** Effect currently driving the RGB LEDs - its grid cell shows a bulb. '' = none. */
  rgbActiveEffect: string;
  /** Slot live on the RGB hardware for this controller's effect (preset-row bulb), or null. */
  rgbActiveSlot: number | null;
}
