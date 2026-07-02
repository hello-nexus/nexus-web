import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchCloudAccounts, type CloudAccountSummary } from '../api/cloud';

export interface UseCloudAccountsResult {
  activeAccountId: string | null;
  activeAccount: CloudAccountSummary | null;
  refresh: () => Promise<void>;
}

// Login/register/logout/password/username/privacy/delete/avatar all run
// through AuthBackend (api/authBackend.ts + api/localServiceBackend.ts) -
// this hook only tracks which account (if any) is active, for the account
// page gate and the top-bar identity chip.
export function useCloudAccounts(enabled: boolean): UseCloudAccountsResult {
  const [accounts, setAccounts] = useState<CloudAccountSummary[]>([]);
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const data = await fetchCloudAccounts();
    if (data) {
      setAccounts(data.accounts ?? []);
      setActiveAccountId(data.activeAccountId ?? null);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void refresh();
  }, [enabled, refresh]);

  const activeAccount = useMemo(
    () => accounts.find(a => a.accountId === activeAccountId) ?? null,
    [accounts, activeAccountId],
  );

  // refresh is already useCallback-stable, so this object only gets a new
  // reference when activeAccountId/activeAccount actually change - not on
  // every render of a caller like Dashboard.tsx. Consumers that depend on
  // the whole returned object (e.g. an effect's dependency array) need that
  // stability to avoid re-firing on unrelated re-renders.
  return useMemo(() => ({
    activeAccountId, activeAccount, refresh,
  }), [activeAccountId, activeAccount, refresh]);
}
