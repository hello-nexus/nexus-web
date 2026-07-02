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

describe('AccountSignedIn profile sync rows', () => {
  const PROFILE_MAIN: SyncProfileStatus = { profileId: 'p1', name: 'Main', lastSyncedAt: '', revision: 0 };
  const PROFILE_WORK: SyncProfileStatus = { profileId: 'p2', name: 'Work', lastSyncedAt: '', revision: 0 };

  it('renders one row per profile with a never-synced label and no per-row buttons', () => {
    renderSignedIn({ sync: { ...SYNC, profiles: [PROFILE_MAIN, PROFILE_WORK] } });

    expect(screen.getByText('Main')).toBeInTheDocument();
    expect(screen.getByText('Work')).toBeInTheDocument();
    expect(screen.getAllByText('account.sync.neverSyncedYet')).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'account.sync.syncNow' })).toHaveLength(1);
  });

  it('shows a formatted timestamp instead of the never-synced label once a profile has synced', () => {
    const synced: SyncProfileStatus = { ...PROFILE_MAIN, lastSyncedAt: '2026-01-01T00:00:00.000Z' };
    renderSignedIn({ sync: { ...SYNC, profiles: [synced] } });

    expect(screen.queryByText('account.sync.neverSyncedYet')).toBeNull();
  });
});

describe('AccountSignedIn sync now control', () => {
  const PROFILE_MAIN: SyncProfileStatus = { profileId: 'p1', name: 'Main', lastSyncedAt: '', revision: 0 };

  function syncNowButton() {
    return screen.getByRole('button', { name: 'account.sync.syncNow' });
  }

  function rerenderWith(rerender: ReturnType<typeof renderSignedIn>['rerender'], backend: AuthBackend, accounts: UseCloudAccountsResult, nextSync: UseSyncStatusResult) {
    rerender(
      <ToastProvider>
        <AccountSignedIn
          backend={backend}
          account={ACCOUNT_ONE}
          accounts={accounts}
          sync={nextSync}
          recoveryFresh={false}
          onRecoveryFreshConsumed={vi.fn()}
        />
      </ToastProvider>,
    );
  }

  it('spins from click until the triggered pass leaves the syncing state', async () => {
    const syncNow = vi.fn().mockResolvedValue(undefined);
    const backend = makeBackend();
    const accounts = makeAccounts();
    const sync: UseSyncStatusResult = { ...SYNC, state: 'idle', profiles: [PROFILE_MAIN], syncNow };
    const { rerender } = renderSignedIn({ backend, accounts, sync });

    fireEvent.click(syncNowButton());
    expect(syncNow).toHaveBeenCalledTimes(1);
    expect(syncNowButton()).toHaveAttribute('data-loading', 'true');

    rerenderWith(rerender, backend, accounts, { ...SYNC, state: 'syncing', profiles: [PROFILE_MAIN], syncNow });
    expect(syncNowButton()).toHaveAttribute('data-loading', 'true');

    await act(async () => { await Promise.resolve(); });
    expect(syncNowButton()).toHaveAttribute('data-loading', 'true');

    rerenderWith(rerender, backend, accounts, { ...SYNC, state: 'idle', profiles: [PROFILE_MAIN], syncNow });
    await waitFor(() => {
      expect(syncNowButton()).not.toHaveAttribute('data-loading', 'true');
    });
  });

  it('regression: settles once state leaves syncing even though a clean profile\'s lastSyncedAt never advances', async () => {
    const syncNow = vi.fn().mockResolvedValue(undefined);
    const backend = makeBackend();
    const accounts = makeAccounts();
    const cleanProfile: SyncProfileStatus = { profileId: 'p1', name: 'Main', lastSyncedAt: '', revision: 0 };
    const dirtyProfile: SyncProfileStatus = { profileId: 'p2', name: 'Work', lastSyncedAt: '2026-01-01T00:00:00.000Z', revision: 4 };
    const sync: UseSyncStatusResult = { ...SYNC, state: 'idle', profiles: [cleanProfile, dirtyProfile], syncNow };
    const { rerender } = renderSignedIn({ backend, accounts, sync });

    fireEvent.click(syncNowButton());

    rerenderWith(rerender, backend, accounts, { ...SYNC, state: 'syncing', profiles: [cleanProfile, dirtyProfile], syncNow });
    await act(async () => { await Promise.resolve(); });
    expect(syncNowButton()).toHaveAttribute('data-loading', 'true');

    const dirtyProfileSynced: SyncProfileStatus = { ...dirtyProfile, lastSyncedAt: '2026-01-01T00:05:00.000Z' };
    rerenderWith(rerender, backend, accounts, { ...SYNC, state: 'idle', profiles: [cleanProfile, dirtyProfileSynced], syncNow });

    await waitFor(() => {
      expect(syncNowButton()).not.toHaveAttribute('data-loading', 'true');
    });
  });
});
