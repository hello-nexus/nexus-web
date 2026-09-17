/** Length the api mints; the field submits as soon as it holds this many. */
export const RECOVERY_CODE_LENGTH = 6;

/**
 * Whatever was typed or pasted, reduced to the characters the code is made of.
 * The grouping dash is shown on the device that holds the code but never kept
 * here, so a code copied with it, or typed without it, is the same input.
 */
export function normalizeRecoveryCode(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, RECOVERY_CODE_LENGTH);
}
