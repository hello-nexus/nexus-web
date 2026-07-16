// Pure helpers for the account devices section: manual installId generation
// and the client-side hostname/spec mirrors of the server's validation.

import type { SystemSpecs } from '../../../../hooks/useSystemSpecs';

const MANUAL_INSTALL_ID_PREFIX = 'manual-';

/** A fresh client-generated id for a manually-added device: 'manual-' + 32 hex chars. */
export function generateManualInstallId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return MANUAL_INSTALL_ID_PREFIX + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Mirrors nexus-api's ACCOUNT_CONSTANTS.deviceHostnameMaxLength - kept in sync
// manually since the two repos don't share a types package.
export const DEVICE_HOSTNAME_MAX_LENGTH = 100;

// Mirrors nexus-api's ACCOUNT_CONSTANTS.deviceSpecValueMaxLength.
export const DEVICE_SPEC_VALUE_MAX_LENGTH = 200;

// Mirrors nexus-api's device cap per account. Used only for the client-side
// error message; the server response is the authority on whether a device
// was actually accepted.
export const DEVICE_MAX_PER_ACCOUNT = 12;

export function isValidDeviceHostname(hostname: string): boolean {
  const trimmed = hostname.trim();
  return trimmed.length > 0 && trimmed.length <= DEVICE_HOSTNAME_MAX_LENGTH;
}

/** Drops spec fields the user left blank so an edit never overwrites a filled value with empty string. */
export function trimDeviceSpecs(specs: Record<string, string>): Record<string, string> {
  const trimmed: Record<string, string> = {};
  for (const [key, value] of Object.entries(specs)) {
    const v = value.trim();
    if (v.length > 0) trimmed[key] = v;
  }
  return trimmed;
}

/** Maps the local service's SystemSpecs fields into the manual-device spec Record shape, dropping empty fields and capping the length the field input already enforces on typed input. */
export function systemSpecsToDeviceSpecs(specs: SystemSpecs): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(specs)) {
    if (value) result[key] = value.slice(0, DEVICE_SPEC_VALUE_MAX_LENGTH);
  }
  return result;
}
