/** Length the api mints; the form only submits once the field holds this many. */
export const RECOVERY_CODE_LENGTH = 6;

/** Whatever was typed or pasted, reduced to the characters the code is made of. */
export function normalizeRecoveryCode(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, RECOVERY_CODE_LENGTH);
}

/** Grouped the way the code is shown on the device that asked for the reset. */
export function formatRecoveryCode(code: string): string {
  return code.length > 3 ? `${code.slice(0, 3)}-${code.slice(3)}` : code;
}
