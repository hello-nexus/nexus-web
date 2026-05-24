import {
  EFFECTS,
  TEMPLATE_COUNT,
  defaultStateFor,
  type EffectDef,
  type EffectState,
} from '../types/lighting';
import { buildDefaultTemplates } from '../types/lightingTemplates';

export type PanelBackgroundMode = 'solid' | 'shader';
export type PanelResolvedTheme = 'dark' | 'light';

export const DEFAULT_PANEL_BACKGROUND_EFFECT = 'aurora';
export const DEFAULT_PANEL_BACKGROUND_TEMPLATE = 0;
export const DEFAULT_PANEL_BACKGROUND_OPACITY = 0.4;
export const DEFAULT_PANEL_WIDGET_OPACITY = 1;
export const DEFAULT_PANEL_WIDGET_LABELS = true;

export const PANEL_BACKGROUND_EFFECTS: EffectDef[] = EFFECTS.filter(effect => !effect.audio);

// Paired preset sets: index i in DARK is the dark counterpart of index i in LIGHT.
// Two rows of ten across ten hue families - violet, purple, pink, red, orange,
// amber, green, teal, cyan, blue. Row 1 is a clearly tinted darker / lighter
// shade of the family; row 2 is much more colorful (deep saturated darks for
// the dark theme, vivid pastels for the light theme). Columns line up with
// PRESET_ACCENTS so a chosen accent has a matching background tone.
// Column 0 is a neutral grayscale (default / "no tint"); columns 1-9
// are tinted per the PRESET_ACCENTS hue families.
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

// Build the dark/light pair for a single picked color. For preset values both
// theme slots resolve to the matching column so dark/light always stay in the
// same hue family. For custom (non-preset) hex the same value is used for both
// since we cannot derive a counterpart.
export function panelBackgroundPair(hex: string): { dark: string; light: string } {
  const idx = findPresetIndex(hex);
  if (idx >= 0) return { dark: BG_PRESETS_DARK[idx], light: BG_PRESETS_LIGHT[idx] };
  return { dark: hex, light: hex };
}

// Resolve the active background for the given theme. Always derives both
// themes from the same column so toggling dark <-> light stays in the picked
// hue family - a separately stored opposite-theme color is intentionally
// ignored. Stale separately-stored data gets corrected on the next commit
// because commitBackground writes both slots in lockstep.
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

export function normalizePanelBackgroundMode(value: string | null | undefined): PanelBackgroundMode {
  return value === 'shader' ? 'shader' : 'solid';
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
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_PANEL_BACKGROUND_OPACITY;
  return Math.min(Math.max(value, 0), 1);
}

export function normalizePanelWidgetOpacity(value: number | null | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_PANEL_WIDGET_OPACITY;
  return Math.min(Math.max(value, 0), 1);
}

export function normalizePanelWidgetLabels(value: boolean | null | undefined): boolean {
  if (typeof value !== 'boolean') return DEFAULT_PANEL_WIDGET_LABELS;
  return value;
}

export function panelBackgroundState(effectKey: string, templateIndex: number): EffectState {
  const effect = normalizePanelBackgroundEffect(effectKey);
  const template = normalizePanelBackgroundTemplate(templateIndex);
  const bundle = buildDefaultTemplates(effect);
  const base = defaultStateFor(effect);
  const slot = bundle.slots[template];

  return slot
    ? { ...base, ...slot, params: { ...base.params, ...slot.params } }
    : base;
}
