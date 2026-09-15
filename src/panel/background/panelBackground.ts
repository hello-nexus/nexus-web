import {
  EFFECTS,
  TEMPLATE_COUNT,
  categoryOf,
  defaultStateFor,
  type EffectCategory,
  type EffectDef,
  type EffectState,
  type EffectTemplateBundle,
} from '../../types/lighting';
import { defaultTemplatesFor } from '../../types/lightingTemplates';
import { cachedAnimateDefaults } from '../../api/lighting';
import { getInstallDefaults } from '../../api/installDefaultsCache';
import { PANEL_WIDGET_PADDING_DEFAULT_PERCENT } from '../engine/grid';

export type PanelBackgroundMode = 'solid' | 'shader' | 'media';

// Frost strength, percent 0-100; 0 renders no frost pass at all.
export const DEFAULT_PANEL_BACKGROUND_FROST = 0;
// Granularity of the whole control, not just the drag: EditableNumber snaps a
// typed value to it too.
export const PANEL_BACKGROUND_FROST_STEP = 10;
export const PANEL_WIDGET_PADDING_STEP = 25;
export type PanelResolvedTheme = 'dark' | 'light';

export const DEFAULT_PANEL_BACKGROUND_EFFECT = 'plasma';
export const DEFAULT_PANEL_BACKGROUND_TEMPLATE = 0;
// A panel with no stored opacity shows its background at full strength in
// every mode - a new panel is meant to look like the background the user
// picked, not a dimmed one. Applied at record-read time;
// normalizePanelBackgroundOpacity only clamps an already-stored concrete value.
export const DEFAULT_SOLID_BACKGROUND_OPACITY = 1;
export const DEFAULT_OVERLAY_BACKGROUND_OPACITY = 1;

export function defaultBackgroundOpacityForMode(mode: PanelBackgroundMode): number {
  return mode === 'solid' ? DEFAULT_SOLID_BACKGROUND_OPACITY : DEFAULT_OVERLAY_BACKGROUND_OPACITY;
}
// Widget-surface defaults are mastered by the service in
// nexus-service/data/install-defaults.json (panel.*), served at /defaults into
// the install-defaults cache. Read through the cache for one source of truth
// (as defaultLayout.ts does). The literals below are only the bootstrap-race
// fallback before the cache fills, and must match the JSON.
const WIDGET_OPACITY_FALLBACK = 0.7;
const WIDGET_LABELS_FALLBACK = false;

export const defaultPanelWidgetOpacity = (): number =>
  getInstallDefaults()?.panel.widgetOpacity ?? WIDGET_OPACITY_FALLBACK;
export const defaultPanelWidgetLabels = (): boolean =>
  getInstallDefaults()?.panel.widgetLabels ?? WIDGET_LABELS_FALLBACK;
// Not read from install-defaults: install-defaults.json has no widgetPadding
// entry (the service DTO stores it as a nullable percent, defaulting to this
// constant client-side, same as a null WidgetOpacity would if it had no
// install-defaults entry either).
export const defaultPanelWidgetPadding = (): number => PANEL_WIDGET_PADDING_DEFAULT_PERCENT;

// Categories the background picker leaves out. Flat fills, 2-tone patterns and
// spectrum ramps are LED looks - behind widgets they read as a solid or a
// hard-edged graphic, which is what the Solid background mode is for.
const PANEL_BACKGROUND_HIDDEN_CATEGORIES: ReadonlySet<EffectCategory> =
  new Set<EffectCategory>(['simple', 'twotone', 'spectrum']);

/** Browse pool for the background Animations tab: gradients plus every
 *  animated category. Audio-reactive effects are gated on the flag rather than
 *  the category so an effect with no category entry cannot slip into the pool
 *  and then be rejected as unrenderable. */
export const PANEL_BACKGROUND_EFFECTS: EffectDef[] = EFFECTS.filter(
  effect => !effect.audio && !PANEL_BACKGROUND_HIDDEN_CATEGORIES.has(categoryOf(effect.key)),
);

// Renderable is wider than browsable: a panel that already stores a hidden
// effect keeps rendering it rather than jumping to the default behind the
// user's back. Only the audio set is genuinely unrenderable here.
const PANEL_BACKGROUND_RENDERABLE: ReadonlySet<string> =
  new Set(EFFECTS.filter(effect => !effect.audio).map(effect => effect.key));

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

// What renders behind the widgets. 'theme' is the panel's own background
// layer (solid / shader / media); 'wallpaper' redraws the desktop wallpaper
// in-page; 'desktop' makes the kiosk window itself transparent so the live
// desktop shows through, animated wallpapers included.
export type PanelBackdrop = 'theme' | 'wallpaper' | 'desktop';

/**
 * The backdrop the kiosk host passed on the URL. It knows the answer before
 * the page loads, so a see-through panel can paint nothing from its first
 * frame instead of showing a background until the record arrives. The record
 * always supersedes it.
 */
export function backdropHintFromUrl(): PanelBackdrop | null {
  if (typeof window === 'undefined') return null;
  return normalizePanelBackdrop(new URLSearchParams(window.location.search).get('backdrop'));
}

export function normalizePanelBackdrop(value: string | null | undefined): PanelBackdrop | null {
  return value === 'theme' || value === 'wallpaper' || value === 'desktop' ? value : null;
}

// Wallpaper-capable panels (the Y70 and display-bound monitors) default to
// redrawing the wallpaper; every other surface has no desktop behind it and
// stays on the theme backdrop, which also clamps a stored mode that surface
// cannot render. A stored value otherwise wins.
export function resolvePanelBackdrop(
  stored: string | null | undefined,
  wallpaperCapable: boolean,
): PanelBackdrop {
  if (!wallpaperCapable) return 'theme';
  return normalizePanelBackdrop(stored) ?? 'wallpaper';
}

export function normalizePanelBackgroundMode(value: string | null | undefined): PanelBackgroundMode {
  if (value === 'shader') return 'shader';
  if (value === 'media') return 'media';
  return 'solid';
}

export function normalizePanelBackgroundEffect(value: string | null | undefined): string {
  return value != null && PANEL_BACKGROUND_RENDERABLE.has(value)
    ? value
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

// Percent that renders exactly one --blur-backdrop; the scale it yields
// multiplies that token in PanelApp.module.scss.
const PANEL_BACKGROUND_FROST_UNIT_PERCENT = 50;

export function panelBackgroundFrostScale(percent: number): number {
  return percent / PANEL_BACKGROUND_FROST_UNIT_PERCENT;
}

// Snapped to the step: a range input silently sanitizes an off-step value to
// the nearest valid one, so an unsnapped read would show a thumb and a readout
// that disagree.
export function normalizePanelBackgroundFrost(value: number | null | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_PANEL_BACKGROUND_FROST;
  const snapped = Math.round(value / PANEL_BACKGROUND_FROST_STEP) * PANEL_BACKGROUND_FROST_STEP;
  return Math.min(Math.max(snapped, 0), 100);
}

// Seconds a background slide holds; nothing under 5 s, a full-res swap that
// often is heavy on the panel WebViews.
export const PANEL_SLIDESHOW_INTERVALS: readonly number[] = [5, 10, 30, 60, 300, 900, 1800, 3600, 86400];
export const DEFAULT_PANEL_SLIDESHOW_INTERVAL = 30;

// Off-list values (a hand-edited record, an older client) snap to the nearest
// option so the select always shows the interval the panel actually runs.
export function normalizePanelSlideshowInterval(value: number | null | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return DEFAULT_PANEL_SLIDESHOW_INTERVAL;
  return PANEL_SLIDESHOW_INTERVALS.reduce((best, option) => (
    Math.abs(option - value) < Math.abs(best - value) ? option : best
  ));
}

// Snapped for the same reason as the frost above.
export function normalizePanelWidgetPadding(value: number | null | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return defaultPanelWidgetPadding();
  const snapped = Math.round(value / PANEL_WIDGET_PADDING_STEP) * PANEL_WIDGET_PADDING_STEP;
  return Math.min(Math.max(snapped, 0), 100);
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
