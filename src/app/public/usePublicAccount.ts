import { useCallback, useEffect, useState } from 'react';
import { directApiBackend } from '../../api/directApiBackend';
import type { AuthAccount } from '../../api/authBackend';

// Consumed through @app by the Build portal; nothing inside this repo
// imports it.

export interface UsePublicAccountResult {
  /** undefined while the initial silent-refresh load is in flight. */
  account: AuthAccount | null | undefined;
  refresh: () => Promise<void>;
}

// Public web has no local service to hold a session across page loads: every
// browser page that needs the account is a fresh page load, so this
// re-derives the signed-in account from DirectApiBackend's silent refresh
// every mount.
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
