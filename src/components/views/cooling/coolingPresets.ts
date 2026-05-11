import { Power, Moon, Gauge, Zap, Sliders, type LucideIcon } from 'lucide-react';

/**
 * Canonical 5-tab cooling preset set, shared by the desktop CoolingView,
 * the panel cooling widget, and any other surface that needs to
 * mirror the active preset.
 *
 * The string keys mirror the service's CoolingSettings.ActivePreset values
 * exactly so the tab key round-trips through `/cooling/profiles` and
 * `/cooling/profile/{name}` without a translation table.
 */
export type CoolingPresetKey = 'off' | 'silent' | 'balanced' | 'performance' | 'custom';

export interface CoolingPresetDef {
  readonly key: CoolingPresetKey;
  readonly i18nKey: string;
  readonly Icon: LucideIcon;
}

export const COOLING_PRESETS: readonly CoolingPresetDef[] = [
  { key: 'off',         i18nKey: 'cooling.preset.off',         Icon: Power },
  { key: 'silent',      i18nKey: 'cooling.preset.silent',      Icon: Moon },
  { key: 'balanced',    i18nKey: 'cooling.preset.balanced',    Icon: Gauge },
  { key: 'performance', i18nKey: 'cooling.preset.performance', Icon: Zap },
  { key: 'custom',      i18nKey: 'cooling.preset.custom',      Icon: Sliders },
] as const;

export const PRESET_KEYS: readonly CoolingPresetKey[] = COOLING_PRESETS.map(p => p.key);

export function isCoolingPresetKey(value: unknown): value is CoolingPresetKey {
  return typeof value === 'string' && (PRESET_KEYS as readonly string[]).includes(value);
}

/**
 * Map a special curve's `preset` flag (silent / balanced / performance) to
 * the icon used in the curve card. Returns null for user-authored curves.
 */
export function presetIconFor(preset: string | null | undefined): LucideIcon | null {
  if (!preset) return null;
  const def = COOLING_PRESETS.find(p => p.key === preset);
  return def?.Icon ?? null;
}
