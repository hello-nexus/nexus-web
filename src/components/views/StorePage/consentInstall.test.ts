import { describe, expect, it, vi } from 'vitest';
import { CONSENT_DECLINED, installWithConsent } from './consentInstall';

const ok = { appId: 'a', version: '1.0.0', ok: true };
const needs = { appId: 'a', version: '1.0.0', ok: false, reason: 'consent_required', requestedCapabilities: ['appData', 'audio'] };

describe('installWithConsent', () => {
  it('installs with no prompt when the app requests nothing', async () => {
    const run = vi.fn().mockResolvedValue(ok);
    const ask = vi.fn();
    expect(await installWithConsent(run, ask)).toBe(ok);
    expect(ask).not.toHaveBeenCalled();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('resends with exactly the requested grants once the user allows', async () => {
    const run = vi.fn().mockResolvedValueOnce(needs).mockResolvedValueOnce(ok);
    const ask = vi.fn().mockResolvedValue(true);
    expect(await installWithConsent(run, ask)).toBe(ok);
    expect(ask).toHaveBeenCalledWith(['appData', 'audio']);
    expect(run).toHaveBeenNthCalledWith(2, ['appData', 'audio']);
  });

  it('installs nothing and reports a decline when the user cancels', async () => {
    const run = vi.fn().mockResolvedValue(needs);
    const res = await installWithConsent(run, vi.fn().mockResolvedValue(false));
    expect(run).toHaveBeenCalledTimes(1);
    expect(res).toMatchObject({ ok: false, reason: CONSENT_DECLINED });
  });

  it('passes other failures through untouched', async () => {
    const failed = { appId: 'a', version: '1', ok: false, reason: 'sign_in_required' };
    const ask = vi.fn();
    expect(await installWithConsent(vi.fn().mockResolvedValue(failed), ask)).toBe(failed);
    expect(ask).not.toHaveBeenCalled();
  });
});
