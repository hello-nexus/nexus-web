import type { ComponentType } from 'react';
import { Gauge, Power } from 'lucide-react';
import { SignalBarsIcon } from '../SignalBarsIcon';
import type { CurveDef } from '../../../../types/cooling';

/**
 * Canonical 5-tab cooling preset set, shared by the desktop CoolingPage,
 * the panel cooling widget, and any other surface that needs to
 * mirror the active preset.
 *
 * The string keys mirror the service's CoolingSettings.ActivePreset values
 * exactly so the tab key round-trips through `/cooling/profiles` and
 * `/cooling/profile/{name}` without a translation table.
 */
export type CoolingPresetKey = 'off' | 'silent' | 'balanced' | 'turbo' | 'custom';

/**
 * Widened from `LucideIcon` so the silent/balanced/turbo presets can
 * render the shared <SignalBarsIcon /> (1/2/3 cellphone-style bars) -
 * the same visual identity the cooling widget's simple mode uses. The
 * remaining presets (off, custom) keep lucide-react icons. Every
 * consumer just needs the standard size / className / aria-hidden props.
 */
export type IconComponent = ComponentType<{
  size?: number | string;
  className?: string;
  'aria-hidden'?: boolean | 'true';
}>;

export interface CoolingPresetDef {
  readonly key: CoolingPresetKey;
  readonly i18nKey: string;
  readonly Icon: IconComponent;
}

// Per-level signal-bars wrappers. Inline rather than separate exports
// because there's no other call-site for them and an extra file would
// just add indirection.
const SilentIcon: IconComponent = ({ size, className }) => (
  <SignalBarsIcon
    level={1}
    size={typeof size === 'number' ? size : undefined}
    className={className} />
);
const BalancedIcon: IconComponent = ({ size, className }) => (
  <SignalBarsIcon
    level={2}
    size={typeof size === 'number' ? size : undefined}
    className={className} />
);
const TurboIcon: IconComponent = ({ size, className }) => (
  <SignalBarsIcon
    level={3}
    size={typeof size === 'number' ? size : undefined}
    className={className} />
);

// Custom uses lucide Gauge - a recognisable "tunable speed" semantic that
// doesn't compete visually with the signal-bars set.
export const COOLING_PRESETS: readonly CoolingPresetDef[] = [
  { key: 'off',      i18nKey: 'cooling.preset.off',      Icon: Power },
  { key: 'silent',   i18nKey: 'cooling.preset.silent',   Icon: SilentIcon },
  { key: 'balanced', i18nKey: 'cooling.preset.balanced', Icon: BalancedIcon },
  { key: 'turbo',    i18nKey: 'cooling.preset.turbo',    Icon: TurboIcon },
  { key: 'custom',   i18nKey: 'cooling.preset.custom',   Icon: Gauge },
] as const;

export const PRESET_KEYS: readonly CoolingPresetKey[] = COOLING_PRESETS.map(p => p.key);

export function isCoolingPresetKey(value: unknown): value is CoolingPresetKey {
  return typeof value === 'string' && (PRESET_KEYS as readonly string[]).includes(value);
}

/**
 * Map a special curve's `preset` flag (silent / balanced / turbo) to
 * the icon used in the curve card. Returns null for user-authored curves.
 */
export function presetIconFor(preset: string | null | undefined): IconComponent | null {
  if (!preset) return null;
  const def = COOLING_PRESETS.find(p => p.key === preset);
  return def?.Icon ?? null;
}

/** True when a preset curve has been edited away from its defaults. The
 *  comparison is done server-side and shipped on the curve as `isDefault`,
 *  so the FE never has to mirror PresetDefaults locally. */
export function isPresetCurveDirty(curve: CurveDef): boolean {
  return !!curve.preset && curve.isDefault === false;
}
