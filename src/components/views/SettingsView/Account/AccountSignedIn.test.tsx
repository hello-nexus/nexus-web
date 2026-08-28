import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AccountSignedIn } from './AccountSignedIn';
import { ToastProvider } from '../../../common/Toast/Toast';
import type { AuthAccount, AuthBackend } from '../../../../api/authBackend';
import type { UseCloudAccountsResult } from '../../../../hooks/useCloudAccounts';
import type { UseSyncStatusResult } from '../../../../hooks/useSyncStatus';
import type { CloudAccountSummary, SyncProfileStatus } from '../../../../api/cloud';

vi.mock('../../../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string | number>) => {
      let text = key;
      if (params) for (const [k, v] of Object.entries(params)) text += ` ${k}=${v}`;
      return text;
    },
  }),
}));

const ACCOUNT_ONE: AuthAccount = {
  accountId: 'acct-1',
  email: 'alpha@example.com',
  username: 'alpha',
  avatar: null,
  isPrivate: false,
  emailVerified: true,
};

const ACCOUNT_ONE_SUMMARY: CloudAccountSummary = { ...ACCOUNT_ONE };

function makeAccounts(active: CloudAccountSummary = ACCOUNT_ONE_SUMMARY): UseCloudAccountsResult {
  return {
    activeAccountId: active.accountId,
    activeAccount: active,
    refresh: vi.fn(),
  };
}

function makeBackend(overrides: Partial<AuthBackend> = {}): AuthBackend {
  return {
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn().mockResolvedValue(undefined),
    getAccount: vi.fn(),
    recoveryStart: vi.fn(),
    recoveryStatus: vi.fn(),
    changePassword: vi.fn(),
    changeUsername: vi.fn(),
    setPrivate: vi.fn(),
    deleteAccount: vi.fn().mockResolvedValue({ status: 200, body: { error: false } }),
    uploadAvatar: vi.fn(),
    ...overrides,
  };
}

const SYNC: UseSyncStatusResult = {
  state: 'idle',
  lastSyncAt: null,
  conflicts: [],
  profiles: [],
  syncNow: vi.fn(),
  resolve: vi.fn(),
  refresh: vi.fn(),
};

function renderSignedIn(opts: {
  backend?: AuthBackend;
  accounts?: UseCloudAccountsResult;
  sync?: UseSyncStatusResult;
  recoveryFresh?: boolean;
  onRecoveryFreshConsumed?: () => void;
} = {}) {
  const backend = opts.backend ?? makeBackend();
  const accounts = opts.accounts ?? makeAccounts();
  const sync = opts.sync ?? SYNC;
  return render(
    <ToastProvider>
      <AccountSignedIn
        backend={backend}
        account={ACCOUNT_ONE}
        accounts={accounts}
        sync={sync}
        recoveryFresh={opts.recoveryFresh ?? false}
        onRecoveryFreshConsumed={opts.onRecoveryFreshConsumed ?? vi.fn()}
      />
    </ToastProvider>,
  );
}

describe('AccountSignedIn danger zone bridging', () => {
  it('logs out through the backend and refreshes the accounts hook', async () => {
    const logout = vi.fn().mockResolvedValue(undefined);
    const accounts = makeAccounts();
    renderSignedIn({ backend: makeBackend({ logout }), accounts });

    fireEvent.click(screen.getByRole('button', { name: 'account.danger.logOut.label' }));

    await waitFor(() => expect(logout).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(accounts.refresh).toHaveBeenCalled());
  });
});

describe('AccountSignedIn password modal', () => {
  it('opens the change-password modal automatically on a recovery-fresh mount', () => {
    renderSignedIn({ recoveryFresh: true });
    expect(screen.getByLabelText('account.password.new')).toBeInTheDocument();
    expect(screen.queryByLabelText('account.password.current')).toBeNull();
  });
});
