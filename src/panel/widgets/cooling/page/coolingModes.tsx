import type { ComponentType } from 'react';
import { Gauge, Power, Tornado } from 'lucide-react';
import { SignalBarsIcon } from '../SignalBarsIcon';
import type { CurveDef } from '../../../../types/cooling';

/**
 * Canonical 6-tab cooling mode set, shared by the desktop CoolingPage, the
 * panel cooling widget, and any other surface mirroring the active mode.
 *
 * These are "modes" in the UI; the service still calls them presets
 * (CoolingSettings.ActivePreset, `/cooling/profiles`,
 * `/cooling/profile/{name}`), and "preset" now means a user-saved cooling
 * configuration. The key strings mirror the service values exactly so a tab
 * key round-trips without a translation table - do not rename them.
 */
export type CoolingModeKey = 'off' | 'silent' | 'balanced' | 'turbo' | 'max' | 'custom';

/**
 * Widened from `LucideIcon` so the silent/balanced/turbo modes can render the
 * shared <SignalBarsIcon /> (1/2/3 cellphone-style bars); every other mode
 * keeps a lucide-react icon.
 */
export type IconComponent = ComponentType<{
  size?: number | string;
  className?: string;
  'aria-hidden'?: boolean | 'true';
}>;

export interface CoolingModeDef {
  readonly key: CoolingModeKey;
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

// Max leaves the bars scale on purpose - it is a fixed 100%, not a steeper
// curve - and Custom uses lucide Gauge, so neither competes with the set.
export const COOLING_MODES: readonly CoolingModeDef[] = [
  { key: 'off',      i18nKey: 'cooling.mode.off',      Icon: Power },
  { key: 'silent',   i18nKey: 'cooling.mode.silent',   Icon: SilentIcon },
  { key: 'balanced', i18nKey: 'cooling.mode.balanced', Icon: BalancedIcon },
  { key: 'turbo',    i18nKey: 'cooling.mode.turbo',    Icon: TurboIcon },
  { key: 'max',      i18nKey: 'cooling.mode.max',      Icon: Tornado },
  { key: 'custom',   i18nKey: 'cooling.mode.custom',   Icon: Gauge },
] as const;

export const PRESET_KEYS: readonly CoolingModeKey[] = COOLING_MODES.map(p => p.key);

export function isCoolingModeKey(value: unknown): value is CoolingModeKey {
  return typeof value === 'string' && (PRESET_KEYS as readonly string[]).includes(value);
}

/** Icon for a curve's wire `preset` flag (silent / balanced / turbo / max); null for
 *  user-authored curves. */
export function modeIconFor(preset: string | null | undefined): IconComponent | null {
  if (!preset) return null;
  const def = COOLING_MODES.find(p => p.key === preset);
  return def?.Icon ?? null;
}

/** True when a built-in mode's curve has been edited away from its defaults;
 *  compared server-side and shipped as `isDefault`. */
export function isModeCurveDirty(curve: CurveDef): boolean {
  return !!curve.preset && curve.isDefault === false;
}
