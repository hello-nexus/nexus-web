// AuthBackend adapter for the in-app dashboard: proxies through the local
// desktop service's /cloud/* routes (cloud.ts). nexus-service holds the
// actual account tokens; this adapter never sees them. Behavior is byte-for-
// byte what useCloudAccounts already did before the AuthBackend seam existed.

import {
  changeCloudPassword, changeCloudUsername, cloudLogin, cloudLogout, cloudRegister,
  deleteCloudAccount, deleteCloudDevice, fetchCloudAccounts, fetchCloudDevices, fetchCloudRecoveryStatus,
  setCloudAccountPrivate, startCloudRecovery, submitCloudRecoveryCode, upsertCloudDevice, uploadCloudAvatar,
} from './cloud';
import type { AuthAccount, AuthBackend, AuthRecoveryCodeResult } from './authBackend';

/** The service relays the api's error code as the envelope's msg. */
function recoveryCodeResult(status: number, msg: string | undefined): AuthRecoveryCodeResult {
  if (status >= 200 && status < 300) return 'ok';
  if (msg === 'code_mismatch') return 'mismatch';
  if (msg === 'code_attempts_exhausted') return 'exhausted';
  return 'failed';
}

export const localServiceBackend: AuthBackend = {
  login: (identifier, password) => cloudLogin(identifier, password),

  register: (email, password, username) => cloudRegister(email, password, username),

  logout: async () => {
    const data = await fetchCloudAccounts();
    if (data?.activeAccountId) await cloudLogout(data.activeAccountId);
  },

  getAccount: async () => {
    const data = await fetchCloudAccounts();
    if (!data?.activeAccountId) return null;
    const active = data.accounts.find(a => a.accountId === data.activeAccountId);
    return active ? toAuthAccount(active) : null;
  },

  recoveryStart: async (email) => (await startCloudRecovery(email)) !== null,

  recoveryStatus: () => fetchCloudRecoveryStatus(),

  recoverySubmitCode: async (code) => {
    const res = await submitCloudRecoveryCode(code);
    return recoveryCodeResult(res.status, res.body?.msg);
  },

  changePassword: (currentPassword, newPassword) => changeCloudPassword(currentPassword, newPassword),

  changeUsername: (username) => changeCloudUsername(username),

  setPrivate: async (isPrivate) => (await setCloudAccountPrivate(isPrivate)) !== null,

  deleteAccount: (currentPassword) => deleteCloudAccount(currentPassword),

  uploadAvatar: (blob) => uploadCloudAvatar(blob),

  listDevices: () => fetchCloudDevices(),

  upsertDevice: (installId, patch) => upsertCloudDevice(installId, patch),

  deleteDevice: async (installId) => {
    const result = await deleteCloudDevice(installId);
    return result.status >= 200 && result.status < 300;
  },
};

function toAuthAccount(summary: {
  accountId: string; email: string; username: string;
  avatar: { large: string; small: string } | null; isPrivate: boolean; emailVerified: boolean;
}): AuthAccount {
  return {
    accountId: summary.accountId,
    email: summary.email,
    username: summary.username,
    avatar: summary.avatar,
    isPrivate: summary.isPrivate,
    emailVerified: summary.emailVerified,
  };
}
