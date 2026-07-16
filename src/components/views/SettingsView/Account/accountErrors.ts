// Maps the machine error codes /cloud/* returns (in the envelope's `msg`
// field) to translated copy. Unrecognized codes and network failures (body
// null) fall back to one generic message - the server's raw code/msg must
// never reach JSX directly.

import { DEVICE_MAX_PER_ACCOUNT } from './deviceUtils';

const AUTH_ERROR_KEYS: Record<string, string> = {
  invalid_credentials: 'account.error.invalidCredentials',
  email_unverified: 'account.error.emailUnverified',
  username_taken: 'account.error.usernameTaken',
};

export function authErrorMessage(t: (key: string) => string, code: string | null | undefined): string {
  if (code && AUTH_ERROR_KEYS[code]) return t(AUTH_ERROR_KEYS[code]);
  return t('account.error.generic');
}

// The password-change and delete-account routes only ever fail on a wrong
// current password (or a network error); the contract gives no distinct
// machine code for it, so any non-2xx response with a parsed body is treated
// as a wrong-password failure and anything else (network failure, no body)
// falls back to the generic message. `sentWithoutCurrentPassword` is true when
// the request relied on a recovery-fresh session instead of sending
// currentPassword - a failure there means that window expired server-side, not
// that a password was wrong (none was sent), so it gets its own message.
export function currentPasswordErrorMessage(
  t: (key: string) => string,
  hasBody: boolean,
  sentWithoutCurrentPassword: boolean,
): string {
  if (!hasBody) return t('account.error.generic');
  return sentWithoutCurrentPassword ? t('account.error.recoverySessionExpired') : t('account.error.wrongPassword');
}

// upsertDevice also 400s on a spec-validation failure (e.g. a value over the
// server's length cap), so the status alone can't distinguish that from the
// device-cap rejection - only the envelope's `msg` code can. Anything else
// (network failure, an unrecognized code) falls back to the generic message.
export function deviceUpsertErrorMessage(t: (key: string, params?: Record<string, string | number>) => string, msg: string | null | undefined): string {
  if (msg === 'device_limit_reached') return t('account.devices.error.cap', { max: String(DEVICE_MAX_PER_ACCOUNT) });
  return t('account.error.generic');
}
