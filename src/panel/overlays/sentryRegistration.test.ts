import { describe, expect, it } from 'vitest';
import { buildPushRegistration } from './sentryRegistration';
import type { NativePushStatus } from '../device/panelNativeBridge';

const translate = (key: string, params?: Record<string, string | number>) => {
  const text: Record<string, string> = {
    'sentry.push.title': 'Sentry',
    'sentry.push.body': 'Someone is using {pc}',
  };
  let out = text[key] ?? key;
  if (params) for (const [k, v] of Object.entries(params)) out = out.replaceAll(`{${k}}`, String(v));
  return out;
};

const granted: NativePushStatus = { platform: 'ios', permission: 'granted', token: 'ab12', environment: 'sandbox' };

describe('buildPushRegistration', () => {
  it('keeps the {pc} placeholder literal in the translated body', () => {
    expect(buildPushRegistration(granted, translate)).toEqual({
      platform: 'ios', token: 'ab12', environment: 'sandbox', title: 'Sentry', body: 'Someone is using {pc}',
    });
  });

  it('returns null without a granted permission or a token', () => {
    expect(buildPushRegistration(null, translate)).toBeNull();
    expect(buildPushRegistration({ ...granted, permission: 'prompt' }, translate)).toBeNull();
    expect(buildPushRegistration({ ...granted, permission: 'denied' }, translate)).toBeNull();
    expect(buildPushRegistration({ ...granted, token: null }, translate)).toBeNull();
  });

  it('returns null while the locale is still loading (translator echoes the key)', () => {
    expect(buildPushRegistration(granted, key => key)).toBeNull();
  });
});
