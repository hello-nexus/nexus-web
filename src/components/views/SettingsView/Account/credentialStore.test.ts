import { afterEach, describe, expect, it, vi } from 'vitest';
import { storeLoginCredential } from './credentialStore';

function stubPasswordCredentialCtor() {
  (window as unknown as { PasswordCredential: unknown }).PasswordCredential =
    function PasswordCredential(init: unknown) { return init; };
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete (window as unknown as { PasswordCredential?: unknown }).PasswordCredential;
});

describe('storeLoginCredential', () => {
  it('stores the credential when the Credential Management API is present', async () => {
    const store = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { credentials: { store } });
    stubPasswordCredentialCtor();

    await storeLoginCredential('alice', 'hunter2');

    expect(store).toHaveBeenCalledTimes(1);
  });

  it('is skipped silently when PasswordCredential is unavailable', async () => {
    const store = vi.fn();
    vi.stubGlobal('navigator', { credentials: { store } });

    await storeLoginCredential('alice', 'hunter2');

    expect(store).not.toHaveBeenCalled();
  });

  it('is skipped silently when navigator.credentials is unavailable', async () => {
    vi.stubGlobal('navigator', {});
    stubPasswordCredentialCtor();

    await expect(storeLoginCredential('alice', 'hunter2')).resolves.toBeUndefined();
  });

  it('swallows a rejected store() call (user declined the save prompt)', async () => {
    const store = vi.fn().mockRejectedValue(new Error('declined'));
    vi.stubGlobal('navigator', { credentials: { store } });
    stubPasswordCredentialCtor();

    await expect(storeLoginCredential('alice', 'hunter2')).resolves.toBeUndefined();
    expect(store).toHaveBeenCalledTimes(1);
  });
});
