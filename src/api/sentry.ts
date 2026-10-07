import { authFetchWithStatus, deleteService, fetchService, postService, putService } from './service';
import type { NativePushStatus } from '../panel/device/panelNativeBridge';

export interface SentryState {
  supported: boolean;
  armed: boolean;
  locked: boolean;
  alertPhones: number;
  lastAlertAt: number | null;
  cooldownSeconds: number;
}

export type SentryArmResult =
  | { ok: true; state: SentryState }
  | { ok: false; reason: 'not_locked' | 'failed' };

export interface PhonePushRegistration {
  platform: NativePushStatus['platform'];
  token: string;
  environment: NativePushStatus['environment'];
  title: string;
  // Keeps a literal {pc} placeholder; the service fills in the machine name at send time.
  body: string;
}

export const fetchSentry = () => fetchService<SentryState>('/sentry');

export async function armSentry(lock: boolean): Promise<SentryArmResult> {
  const { response, status } = await authFetchWithStatus('/sentry/arm', { method: 'POST', body: { lock } });
  if (!response) return { ok: false, reason: 'failed' };
  let body: (Partial<SentryState> & { error?: string | boolean }) | null = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (status === 409 && body?.error === 'not_locked') return { ok: false, reason: 'not_locked' };
  if (!response.ok || !body) return { ok: false, reason: 'failed' };
  return { ok: true, state: body as SentryState };
}

export const disarmSentry = () => postService<SentryState>('/sentry/disarm', {});

export const registerPhonePush = (registration: PhonePushRegistration) =>
  putService<unknown>('/panel/phone/push', registration);

export const clearPhonePush = () => deleteService<unknown>('/panel/phone/push');
