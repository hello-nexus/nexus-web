import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  activateCloudAccount, changeCloudPassword, changeCloudUsername, cloudLogin, cloudLogout,
  cloudRegister, deleteCloudAccount, fetchCloudAccounts, fetchCloudRecoveryStatus,
  setCloudAccountPrivate, startCloudRecovery, uploadCloudAvatar,
  type CloudAccountSummary, type CloudDeleteResponse, type CloudFetchResult, type CloudLoginResponse,
  type CloudPasswordResponse, type CloudRegisterResponse, type CloudUsernameResponse,
  type RecoveryStartResponse, type RecoveryStatusResponse,
} from '../api/cloud';

export interface UseCloudAccountsResult {
  accounts: CloudAccountSummary[];
  activeAccountId: string | null;
  activeAccount: CloudAccountSummary | null;
  loading: boolean;
  refresh: () => Promise<void>;
  login: (identifier: string, password: string) => Promise<CloudFetchResult<CloudLoginResponse>>;
  register: (email: string, password: string, username: string) => Promise<CloudFetchResult<CloudRegisterResponse>>;
  logout: (accountId: string) => Promise<void>;
  activate: (accountId: string) => Promise<void>;
  recoveryStart: (email: string) => Promise<RecoveryStartResponse | null>;
  recoveryStatus: () => Promise<RecoveryStatusResponse | null>;
  changePassword: (currentPassword: string | undefined, newPassword: string) => Promise<CloudFetchResult<CloudPasswordResponse>>;
  changeUsername: (username: string) => Promise<CloudFetchResult<CloudUsernameResponse>>;
  setPrivate: (isPrivate: boolean) => Promise<void>;
  deleteAccount: (currentPassword?: string) => Promise<CloudFetchResult<CloudDeleteResponse>>;
  uploadAvatar: (blob: Blob) => Promise<boolean>;
}

export function useCloudAccounts(enabled: boolean): UseCloudAccountsResult {
  const [accounts, setAccounts] = useState<CloudAccountSummary[]>([]);
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    const data = await fetchCloudAccounts();
    if (data) {
      setAccounts(data.accounts ?? []);
      setActiveAccountId(data.activeAccountId ?? null);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    setLoading(true);
    refresh().finally(() => setLoading(false));
  }, [enabled, refresh]);

  const login = useCallback(async (identifier: string, password: string) => {
    const result = await cloudLogin(identifier, password);
    if (result.status >= 200 && result.status < 300) await refresh();
    return result;
  }, [refresh]);

  const register = useCallback((email: string, password: string, username: string) =>
    cloudRegister(email, password, username), []);

  const logout = useCallback(async (accountId: string) => {
    await cloudLogout(accountId);
    await refresh();
  }, [refresh]);

  const activate = useCallback(async (accountId: string) => {
    await activateCloudAccount(accountId);
    await refresh();
  }, [refresh]);

  const recoveryStart = useCallback((email: string) => startCloudRecovery(email), []);
  const recoveryStatus = useCallback(() => fetchCloudRecoveryStatus(), []);

  const changePassword = useCallback((currentPassword: string | undefined, newPassword: string) =>
    changeCloudPassword(currentPassword, newPassword), []);

  const changeUsername = useCallback(async (username: string) => {
    const result = await changeCloudUsername(username);
    if (result.status >= 200 && result.status < 300) await refresh();
    return result;
  }, [refresh]);

  const setPrivate = useCallback(async (isPrivate: boolean) => {
    await setCloudAccountPrivate(isPrivate);
    await refresh();
  }, [refresh]);

  const deleteAccount = useCallback(async (currentPassword?: string) => {
    const result = await deleteCloudAccount(currentPassword);
    if (result.status >= 200 && result.status < 300) await refresh();
    return result;
  }, [refresh]);

  const uploadAvatar = useCallback(async (blob: Blob) => {
    const avatar = await uploadCloudAvatar(blob);
    if (avatar) await refresh();
    return avatar !== null;
  }, [refresh]);

  const activeAccount = useMemo(
    () => accounts.find(a => a.accountId === activeAccountId) ?? null,
    [accounts, activeAccountId],
  );

  // Every function above is already useCallback-stable, so this object only
  // gets a new reference when accounts/activeAccountId/loading actually
  // change - not on every render of a caller like Dashboard.tsx. Consumers
  // that depend on the whole returned object (e.g. an effect's dependency
  // array) need that stability to avoid re-firing on unrelated re-renders.
  return useMemo(() => ({
    accounts, activeAccountId, activeAccount, loading, refresh,
    login, register, logout, activate, recoveryStart, recoveryStatus,
    changePassword, changeUsername, setPrivate, deleteAccount, uploadAvatar,
  }), [
    accounts, activeAccountId, activeAccount, loading, refresh,
    login, register, logout, activate, recoveryStart, recoveryStatus,
    changePassword, changeUsername, setPrivate, deleteAccount, uploadAvatar,
  ]);
}
