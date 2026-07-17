import {
  EFFECTS,
  TEMPLATE_COUNT,
  defaultStateFor,
  type EffectDef,
  type EffectState,
  type EffectTemplateBundle,
} from '../../types/lighting';
import { defaultTemplatesFor } from '../../types/lightingTemplates';
import { cachedAnimateDefaults } from '../../api/lighting';
import { getInstallDefaults } from '../../api/installDefaultsCache';

export type PanelBackgroundMode = 'solid' | 'shader' | 'media';
export type PanelBackgroundFrost = 'none' | 'light' | 'heavy';
export type PanelResolvedTheme = 'dark' | 'light';

export const DEFAULT_PANEL_BACKGROUND_EFFECT = 'aurora';
export const DEFAULT_PANEL_BACKGROUND_TEMPLATE = 0;
// Background opacity defaults are mode-aware: a solid colour reads as the full
// backdrop (opaque), while a shader/media overlay sits half-strength over the
// theme background so widgets stay legible. Applied at record-read time when a
// panel has no stored opacity; normalizePanelBackgroundOpacity only clamps an
// already-stored concrete value.
export const DEFAULT_SOLID_BACKGROUND_OPACITY = 1;
export const DEFAULT_OVERLAY_BACKGROUND_OPACITY = 0.5;

export function defaultBackgroundOpacityForMode(mode: PanelBackgroundMode): number {
  return mode === 'solid' ? DEFAULT_SOLID_BACKGROUND_OPACITY : DEFAULT_OVERLAY_BACKGROUND_OPACITY;
}
// Widget-surface defaults are mastered by the service in
// nexus-service/data/install-defaults.json (panel.*), served at /defaults into
// the install-defaults cache. Read through the cache for one source of truth
// (as defaultLayout.ts does). The literals below are only the bootstrap-race
// fallback before the cache fills, and must match the JSON.
const WIDGET_OPACITY_FALLBACK = 0.5;
const WIDGET_LABELS_FALLBACK = false;
// Not read from install-defaults: install-defaults.json has no widgetPadding
// entry (the service DTO stores it as a nullable percent, defaulting to this
// constant client-side, same as a null WidgetOpacity would if it had no
// install-defaults entry either).
const WIDGET_PADDING_DEFAULT_PERCENT = 50;

export const defaultPanelWidgetOpacity = (): number =>
  getInstallDefaults()?.panel.widgetOpacity ?? WIDGET_OPACITY_FALLBACK;
export const defaultPanelWidgetLabels = (): boolean =>
  getInstallDefaults()?.panel.widgetLabels ?? WIDGET_LABELS_FALLBACK;
export const defaultPanelWidgetPadding = (): number => WIDGET_PADDING_DEFAULT_PERCENT;

export const PANEL_BACKGROUND_EFFECTS: EffectDef[] = EFFECTS.filter(effect => !effect.audio);

// Paired preset sets: index i in DARK is the dark counterpart of index i in
// LIGHT. Two rows of ten hue families (violet, purple, pink, red, orange,
// amber, green, teal, cyan, blue). Row 1 is a tinted shade; row 2 is more
// saturated (deep darks / vivid pastels). Columns align with PRESET_ACCENTS
// so an accent has a matching background tone. Column 0 is neutral grayscale
// (no tint); columns 1-9 are tinted per the PRESET_ACCENTS families.
export const BG_PRESETS_DARK: readonly string[] = [
  '#0f0f0f', '#1f0d36', '#2c0d20', '#2c0d0d',
  '#2c1408', '#2a1607', '#082617', '#082621',
  '#07242f', '#0e1c38',
  '#262626', '#581c87', '#831843', '#7f1d1d',
  '#7c2d12', '#78350f', '#064e3b', '#115e59',
  '#155e75', '#1e3a8a',
];

export const BG_PRESETS_LIGHT: readonly string[] = [
  '#fafafa', '#f3e8ff', '#fce7f3', '#fee2e2',
  '#ffedd5', '#fef3c7', '#dcfce7', '#ccfbf1',
  '#cffafe', '#dbeafe',
  '#d4d4d4', '#d8b4fe', '#f9a8d4', '#fca5a5',
  '#fdba74', '#fcd34d', '#86efac', '#5eead4',
  '#67e8f9', '#93c5fd',
];

export const DEFAULT_PANEL_BG_DARK = BG_PRESETS_DARK[0];
export const DEFAULT_PANEL_BG_LIGHT = BG_PRESETS_LIGHT[0];

export function panelBackgroundPresets(resolved: PanelResolvedTheme): readonly string[] {
  return resolved === 'light' ? BG_PRESETS_LIGHT : BG_PRESETS_DARK;
}

export function panelBackgroundDefault(resolved: PanelResolvedTheme): string {
  return resolved === 'light' ? DEFAULT_PANEL_BG_LIGHT : DEFAULT_PANEL_BG_DARK;
}

function findPresetIndex(hex: string): number {
  const n = hex.toLowerCase();
  const d = BG_PRESETS_DARK.findIndex(p => p.toLowerCase() === n);
  if (d >= 0) return d;
  return BG_PRESETS_LIGHT.findIndex(p => p.toLowerCase() === n);
}

export function isPanelBackgroundPreset(hex: string): boolean {
  return findPresetIndex(hex) >= 0;
}

// Build the dark/light pair for a picked color. Presets resolve both slots to
// the matching column (same hue family); custom hex uses the same value for
// both (no counterpart to derive).
export function panelBackgroundPair(hex: string): { dark: string; light: string } {
  const idx = findPresetIndex(hex);
  if (idx >= 0) return { dark: BG_PRESETS_DARK[idx], light: BG_PRESETS_LIGHT[idx] };
  return { dark: hex, light: hex };
}

// Resolve the active background for the theme. Derives both slots from the
// same column so dark <-> light stays in the picked hue family; a separately
// stored opposite-theme color is ignored and corrected on the next commit
// (commitBackground writes both slots in lockstep).
export function resolvePanelBackground(
  dark: string | null | undefined,
  light: string | null | undefined,
  resolved: PanelResolvedTheme,
): string {
  const seed = dark || light;
  if (!seed) return resolved === 'light' ? DEFAULT_PANEL_BG_LIGHT : DEFAULT_PANEL_BG_DARK;
  const pair = panelBackgroundPair(seed);
  return resolved === 'light' ? pair.light : pair.dark;
}

// Wallpaper-capable panels (the Y70 and display-bound monitors) default to
// desktop see-through - background layer OFF, so the wallpaper shows behind
// the widgets; everything else (phone, q-series, streamed panels) defaults
// to the theme backdrop. A stored value always wins.
export function resolvePanelBackgroundEnabled(
  stored: boolean | null | undefined,
  wallpaperCapable: boolean,
): boolean {
  if (typeof stored === 'boolean') return stored;
  return !wallpaperCapable;
}

export function normalizePanelBackgroundMode(value: string | null | undefined): PanelBackgroundMode {
  if (value === 'shader') return 'shader';
  if (value === 'media') return 'media';
  return 'solid';
}

export function normalizePanelBackgroundEffect(value: string | null | undefined): string {
  return PANEL_BACKGROUND_EFFECTS.some(effect => effect.key === value)
    ? value as string
    : DEFAULT_PANEL_BACKGROUND_EFFECT;
}

export function normalizePanelBackgroundTemplate(value: number | null | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_PANEL_BACKGROUND_TEMPLATE;
  return Math.min(Math.max(Math.trunc(value), 0), TEMPLATE_COUNT - 1);
}

export function normalizePanelBackgroundOpacity(value: number | null | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_OVERLAY_BACKGROUND_OPACITY;
  return Math.min(Math.max(value, 0), 1);
}

export function normalizePanelWidgetOpacity(value: number | null | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return defaultPanelWidgetOpacity();
  return Math.min(Math.max(value, 0), 1);
}

export function normalizePanelWidgetLabels(value: boolean | null | undefined): boolean {
  if (typeof value !== 'boolean') return defaultPanelWidgetLabels();
  return value;
}

export function normalizePanelBackgroundFrost(value: string | null | undefined): PanelBackgroundFrost {
  return value === 'light' || value === 'heavy' ? value : 'none';
}

export function normalizePanelWidgetPadding(value: number | null | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return defaultPanelWidgetPadding();
  return Math.min(Math.max(value, 0), 100);
}

// The background's render state for a (effect, slot) selection. Presets are
// universal, so prefer the user's saved bundle (global Templates); fall back to
// the session-cached canonical defaults before it has hydrated.
export function panelBackgroundState(
  effectKey: string,
  templateIndex: number,
  savedBundle?: EffectTemplateBundle | null,
): EffectState {
  const effect = normalizePanelBackgroundEffect(effectKey);
  const template = normalizePanelBackgroundTemplate(templateIndex);
  const bundle = savedBundle ?? defaultTemplatesFor(effect, cachedAnimateDefaults());
  const base = defaultStateFor(effect);
  const slot = bundle.slots[template];
  return slot
    ? { ...base, ...slot, params: { ...base.params, ...(slot.params ?? {}) } }
    : base;
}
