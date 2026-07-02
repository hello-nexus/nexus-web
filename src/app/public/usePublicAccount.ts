import { useCallback, useEffect, useState } from 'react';
import { directApiBackend } from '../../api/directApiBackend';
import type { AuthAccount } from '../../api/authBackend';

export interface UsePublicAccountResult {
  /** undefined while the initial silent-refresh load is in flight. */
  account: AuthAccount | null | undefined;
  refresh: () => Promise<void>;
}

// Public web has no local service to hold a session across page loads: each
// of /login, /register, /recover, /account is a fresh page load (App.tsx
// pathname branch, not client routing), so this re-derives the signed-in
// account from DirectApiBackend's silent refresh every mount.
export function usePublicAccount(): UsePublicAccountResult {
  const [account, setAccount] = useState<AuthAccount | null | undefined>(undefined);

  const refresh = useCallback(async () => {
    setAccount(await directApiBackend.getAccount());
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { account, refresh };
}
