import type { SentryState, PhonePushRegistration } from '../../api/sentry';
import type { NativePushStatus } from '../device/panelNativeBridge';

export const PUSH_TITLE_KEY = 'sentry.push.title';
export const PUSH_BODY_KEY = 'sentry.push.body';

// A card only appears while the PC is locked (armed implies locked) and the OS has a lock watch.
export function sentryCardVisible(state: SentryState | null): state is SentryState {
  return state !== null && state.supported && (state.locked || state.armed);
}

// Null until the phone has a token with permission granted and the strings are translated
// (the translator returns the key itself while the locale file is still loading).
export function buildPushRegistration(
  status: NativePushStatus | null,
  t: (key: string, params?: Record<string, string | number>) => string,
): PhonePushRegistration | null {
  if (!status || status.permission !== 'granted' || !status.token) return null;
  const title = t(PUSH_TITLE_KEY);
  // The service fills {pc} at send time, so the placeholder is passed through verbatim.
  const body = t(PUSH_BODY_KEY, { pc: '{pc}' });
  if (title === PUSH_TITLE_KEY || body === PUSH_BODY_KEY) return null;
  return {
    platform: status.platform,
    token: status.token,
    environment: status.environment,
    title,
    body,
  };
}
