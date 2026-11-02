/** The sag and lean sliders reach this many degrees either way. */
export const SIM_TILT_MAX = 10;

const PIN_COUNT = 6;
const NORMAL = 7.5;
const withPin = (index: number, amps: number, rest = NORMAL) =>
  Array.from({ length: PIN_COUNT }, (_, i) => (i === index ? amps : rest));

/** Pin currents for each preset, run through the service's real detector. */
export const ASTRAL_PRESETS: Record<string, number[]> = {
  normal: withPin(-1, NORMAL),
  caution: withPin(2, 8.8),
  overcurrent: withPin(2, 13),
  critical: withPin(2, 18),
  dead: withPin(2, 0, 8),
};

/** The preset whose six currents match, or '' once a slider moved off all of them. */
export const matchingPreset = (amps: readonly number[]): string =>
  Object.keys(ASTRAL_PRESETS).find(k => ASTRAL_PRESETS[k].every((v, i) => v === amps[i])) ?? '';
