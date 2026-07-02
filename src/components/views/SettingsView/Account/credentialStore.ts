interface PasswordCredentialInit {
  id: string;
  password: string;
}

interface PasswordCredentialCtor {
  new (init: PasswordCredentialInit): Credential;
}

// Hands a just-verified login to the browser's own password manager via the
// (Chromium-only) Credential Management API. Nexus never persists the
// password itself - a missing API or a declined save prompt are both silent
// no-ops, never surfaced to the user.
export async function storeLoginCredential(identifier: string, password: string): Promise<void> {
  const ctor = (window as unknown as { PasswordCredential?: PasswordCredentialCtor }).PasswordCredential;
  const credentials = (navigator as Navigator & { credentials?: CredentialsContainer }).credentials;
  if (typeof ctor !== 'function' || typeof credentials?.store !== 'function') return;
  try {
    await credentials.store(new ctor({ id: identifier, password }));
  } catch {
    // Declined by the user or rejected by the browser - not an error.
  }
}
