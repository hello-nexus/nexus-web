/** Length the api mints; the field submits as soon as it holds this many. */
export const RECOVERY_CODE_LENGTH = 6;

/** Where the code is split, on the device that shows it and in the field that takes it. */
const GROUP_LENGTH = 3;

/**
 * Whatever was typed or pasted, reduced to the characters a code is made of.
 * Symbols, spaces and the grouping dash are dropped as they are typed rather
 * than refused, so a code read off another screen cannot be entered wrong.
 */
export function normalizeRecoveryCode(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, RECOVERY_CODE_LENGTH);
}

/** Grouped the way the code is shown on the device that asked for the reset. */
export function formatRecoveryCode(code: string): string {
  return code.length > GROUP_LENGTH
    ? `${code.slice(0, GROUP_LENGTH)}-${code.slice(GROUP_LENGTH)}`
    : code;
}

/** Longest the field ever displays: a whole code plus the dash inside it. */
export const RECOVERY_CODE_DISPLAY_LENGTH = RECOVERY_CODE_LENGTH + 1;
