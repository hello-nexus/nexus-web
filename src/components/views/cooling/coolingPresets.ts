import { Power, Moon, Gauge, Zap, Sliders, type LucideIcon } from 'lucide-react';
import type { CurveDef, CurvePreset } from '../../../types/cooling';

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

// Mirror of FanProfiles.PresetDefaults.For on the service. Used only to gate
// the Reset button; the reset itself is server-driven, so drift here just
// enables/disables the button incorrectly.
const PRESET_LINEAR_DEFAULTS: Readonly<Record<CurvePreset, readonly [number, number, number, number, number]>> = {
  // [responseTime, minTemp, maxTemp, minSpeed, maxSpeed]
  silent:      [3.0, 45, 85, 20, 70],
  balanced:    [1.5, 35, 75, 30, 90],
  performance: [0.5, 30, 65, 50, 100],
};

/** True when a preset curve is no longer at its default Linear template.
 *  Float `!==` is safe here because the sliders snap to integer steps (temps,
 *  speeds) or `Number(v.toFixed(1))` (response time), and the defaults above
 *  are exactly representable at those steps — no rounding drift to worry about. */
export function isPresetCurveDirty(curve: CurveDef): boolean {
  if (!curve.preset) return false;
  if (curve.type !== 'linear') return true;
  const [rt, mnT, mxT, mnS, mxS] = PRESET_LINEAR_DEFAULTS[curve.preset];
  const l = curve.linear;
  return l.responseTime !== rt || l.minTemp !== mnT || l.maxTemp !== mxT
      || l.minSpeed !== mnS || l.maxSpeed !== mxS;
}
