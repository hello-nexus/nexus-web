import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AccountSignedIn } from './AccountSignedIn';
import { ToastProvider } from '../../../common/Toast/Toast';
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

const ACCOUNT_ONE: CloudAccountSummary = {
  accountId: 'acct-1',
  email: 'alpha@example.com',
  username: 'alpha',
  avatar: null,
  isPrivate: false,
  emailVerified: true,
  active: true,
  lastSyncAt: null,
};

const ACCOUNT_TWO: CloudAccountSummary = {
  ...ACCOUNT_ONE,
  accountId: 'acct-2',
  email: 'beta@example.com',
  username: 'beta',
  active: false,
};

function makeAccounts(active: CloudAccountSummary, all: CloudAccountSummary[] = [active]): UseCloudAccountsResult {
  return {
    accounts: all,
    activeAccountId: active.accountId,
    activeAccount: active,
    loading: false,
    refresh: vi.fn(),
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    activate: vi.fn(),
    recoveryStart: vi.fn(),
    recoveryStatus: vi.fn(),
    changePassword: vi.fn(),
    changeUsername: vi.fn(),
    setPrivate: vi.fn(),
    deleteAccount: vi.fn(),
    uploadAvatar: vi.fn(),
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

function renderSignedIn(
  recoveryFresh: boolean,
  accounts: UseCloudAccountsResult,
  onRecoveryFreshConsumed = vi.fn(),
  sync: UseSyncStatusResult = SYNC,
) {
  return render(
    <ToastProvider>
      <AccountSignedIn
        accounts={accounts}
        sync={sync}
        recoveryFresh={recoveryFresh}
        onRecoveryFreshConsumed={onRecoveryFreshConsumed}
      />
    </ToastProvider>,
  );
}

describe('AccountSignedIn single-account model', () => {
  it('renders no account switcher or add-account affordances', () => {
    renderSignedIn(false, makeAccounts(ACCOUNT_ONE, [ACCOUNT_ONE, ACCOUNT_TWO]));
    expect(screen.queryByText('account.switcher.title')).toBeNull();
    expect(screen.queryByText('beta')).toBeNull();
    expect(screen.queryByRole('button', { name: 'account.switcher.addAccount' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'account.switcher.activate' })).toBeNull();
  });

  it('logs out the active account from the danger zone', () => {
    const logout = vi.fn().mockResolvedValue(undefined);
    const accounts = makeAccounts(ACCOUNT_ONE);
    accounts.logout = logout;
    renderSignedIn(false, accounts);

    fireEvent.click(screen.getByRole('button', { name: 'account.danger.logOut.label' }));

    expect(logout).toHaveBeenCalledWith('acct-1');
  });
});

describe('AccountSignedIn password modal', () => {
  it('opens the change-password modal automatically on a recovery-fresh mount', () => {
    renderSignedIn(true, makeAccounts(ACCOUNT_ONE));
    // The recovery-fresh effect must win the initial-mount race against the
    // account-switch reset effect (both fire on first render).
    expect(screen.getByLabelText('account.password.new')).toBeInTheDocument();
    expect(screen.queryByLabelText('account.password.current')).toBeNull();
  });

  it('closes the change-password modal when the active account switches', () => {
    const { rerender } = renderSignedIn(false, makeAccounts(ACCOUNT_ONE, [ACCOUNT_ONE, ACCOUNT_TWO]));
    fireEvent.click(screen.getByRole('button', { name: 'account.password.change' }));
    expect(screen.getByLabelText('account.password.new')).toBeInTheDocument();

    rerender(
      <ToastProvider>
        <AccountSignedIn
          accounts={makeAccounts(ACCOUNT_TWO, [ACCOUNT_ONE, ACCOUNT_TWO])}
          sync={SYNC}
          recoveryFresh={false}
          onRecoveryFreshConsumed={vi.fn()}
        />
      </ToastProvider>,
    );
    expect(screen.queryByLabelText('account.password.new')).toBeNull();
  });
});

describe('AccountSignedIn username cooldown', () => {
  function saveNewUsername() {
    fireEvent.input(screen.getByLabelText('account.username.label'), { target: { value: 'newname' } });
    fireEvent.click(screen.getByRole('button', { name: 'account.save' }));
  }

  it('shows the live cooldown message when the 409 response carries a retryAt', async () => {
    const accounts = makeAccounts(ACCOUNT_ONE);
    accounts.changeUsername = vi.fn().mockResolvedValue({
      status: 409,
      body: { error: true, msg: 'username_cooldown', retryAt: new Date(Date.now() + 5 * 3_600_000).toISOString() },
    });
    renderSignedIn(false, accounts);

    saveNewUsername();

    await waitFor(() => {
      expect(screen.getByText(content => content.startsWith('account.username.error.cooldownIn'))).toBeInTheDocument();
    });
    expect(screen.queryByText('account.username.error.cooldown')).toBeNull();
  });

  it('falls back to the static cooldown message when the 409 response omits retryAt', async () => {
    const accounts = makeAccounts(ACCOUNT_ONE);
    accounts.changeUsername = vi.fn().mockResolvedValue({
      status: 409,
      body: { error: true, msg: 'username_cooldown' },
    });
    renderSignedIn(false, accounts);

    saveNewUsername();

    await waitFor(() => {
      expect(screen.getByText('account.username.error.cooldown')).toBeInTheDocument();
    });
  });

  it('falls back to the static cooldown message when retryAt is already in the past', async () => {
    const accounts = makeAccounts(ACCOUNT_ONE);
    accounts.changeUsername = vi.fn().mockResolvedValue({
      status: 409,
      body: { error: true, msg: 'username_cooldown', retryAt: new Date(Date.now() - 1_000).toISOString() },
    });
    renderSignedIn(false, accounts);

    saveNewUsername();

    // An elapsed retryAt makes useRetryCountdown return null, so the save
    // must still surface the static message instead of no message at all.
    await waitFor(() => {
      expect(screen.getByText('account.username.error.cooldown')).toBeInTheDocument();
    });
  });
});

describe('AccountSignedIn profile sync rows', () => {
  const PROFILE_MAIN: SyncProfileStatus = { profileId: 'p1', name: 'Main', lastSyncedAt: '', revision: 0 };
  const PROFILE_WORK: SyncProfileStatus = { profileId: 'p2', name: 'Work', lastSyncedAt: '', revision: 0 };

  it('renders one row per profile with a never-synced label and no per-row buttons', () => {
    const sync: UseSyncStatusResult = { ...SYNC, profiles: [PROFILE_MAIN, PROFILE_WORK] };
    renderSignedIn(false, makeAccounts(ACCOUNT_ONE), vi.fn(), sync);

    expect(screen.getByText('Main')).toBeInTheDocument();
    expect(screen.getByText('Work')).toBeInTheDocument();
    expect(screen.getAllByText('account.sync.neverSyncedYet')).toHaveLength(2);
    // Only the section header's single Sync Now control exists.
    expect(screen.getAllByRole('button', { name: 'account.sync.syncNow' })).toHaveLength(1);
  });

  it('shows a formatted timestamp instead of the never-synced label once a profile has synced', () => {
    const synced: SyncProfileStatus = { ...PROFILE_MAIN, lastSyncedAt: '2026-01-01T00:00:00.000Z' };
    const sync: UseSyncStatusResult = { ...SYNC, profiles: [synced] };
    renderSignedIn(false, makeAccounts(ACCOUNT_ONE), vi.fn(), sync);

    expect(screen.queryByText('account.sync.neverSyncedYet')).toBeNull();
  });
});

describe('AccountSignedIn sync now control', () => {
  const PROFILE_MAIN: SyncProfileStatus = { profileId: 'p1', name: 'Main', lastSyncedAt: '', revision: 0 };

  function syncNowButton() {
    return screen.getByRole('button', { name: 'account.sync.syncNow' });
  }

  function rerenderWith(rerender: ReturnType<typeof renderSignedIn>['rerender'], nextSync: UseSyncStatusResult) {
    rerender(
      <ToastProvider>
        <AccountSignedIn
          accounts={makeAccounts(ACCOUNT_ONE)}
          sync={nextSync}
          recoveryFresh={false}
          onRecoveryFreshConsumed={vi.fn()}
        />
      </ToastProvider>,
    );
  }

  it('spins from click until the triggered pass leaves the syncing state', async () => {
    const syncNow = vi.fn().mockResolvedValue(undefined);
    const sync: UseSyncStatusResult = { ...SYNC, state: 'idle', profiles: [PROFILE_MAIN], syncNow };
    const { rerender } = renderSignedIn(false, makeAccounts(ACCOUNT_ONE), vi.fn(), sync);

    fireEvent.click(syncNowButton());
    expect(syncNow).toHaveBeenCalledTimes(1);
    expect(syncNowButton()).toHaveAttribute('data-loading', 'true');

    // A background poll landing before this click's own request resolves
    // reports the pass actively running - must not affect anything yet,
    // the settle check has not even run (ownRefreshLanded is still false).
    rerenderWith(rerender, { ...SYNC, state: 'syncing', profiles: [PROFILE_MAIN], syncNow });
    expect(syncNowButton()).toHaveAttribute('data-loading', 'true');

    // Let this click's own syncNow() promise resolve, mirroring production
    // where syncNow() performs its own refresh before resolving. The most
    // recent state is still 'syncing' (the pass has not finished), so the
    // settle check (now gated open) must still not clear the spinner.
    await act(async () => { await Promise.resolve(); });
    expect(syncNowButton()).toHaveAttribute('data-loading', 'true');

    // A later poll reports the pass finished.
    rerenderWith(rerender, { ...SYNC, state: 'idle', profiles: [PROFILE_MAIN], syncNow });
    await waitFor(() => {
      expect(syncNowButton()).not.toHaveAttribute('data-loading', 'true');
    });
  });

  it('regression: settles once state leaves syncing even though a clean profile\'s lastSyncedAt never advances', async () => {
    const syncNow = vi.fn().mockResolvedValue(undefined);
    const cleanProfile: SyncProfileStatus = { profileId: 'p1', name: 'Main', lastSyncedAt: '', revision: 0 };
    const dirtyProfile: SyncProfileStatus = { profileId: 'p2', name: 'Work', lastSyncedAt: '2026-01-01T00:00:00.000Z', revision: 4 };
    const sync: UseSyncStatusResult = { ...SYNC, state: 'idle', profiles: [cleanProfile, dirtyProfile], syncNow };
    const { rerender } = renderSignedIn(false, makeAccounts(ACCOUNT_ONE), vi.fn(), sync);

    fireEvent.click(syncNowButton());

    // The pass is actively running; this click's own refresh lands mid-pass.
    rerenderWith(rerender, { ...SYNC, state: 'syncing', profiles: [cleanProfile, dirtyProfile], syncNow });
    await act(async () => { await Promise.resolve(); });
    expect(syncNowButton()).toHaveAttribute('data-loading', 'true');

    // The pass finishes: the dirty profile's timestamp moved, the clean
    // profile's never did (nothing to push) - the old per-row settle check
    // keyed to a specific profile's lastSyncedAt would hang forever for a
    // row on the clean profile. The header button settles on state alone.
    const dirtyProfileSynced: SyncProfileStatus = { ...dirtyProfile, lastSyncedAt: '2026-01-01T00:05:00.000Z' };
    rerenderWith(rerender, { ...SYNC, state: 'idle', profiles: [cleanProfile, dirtyProfileSynced], syncNow });

    await waitFor(() => {
      expect(syncNowButton()).not.toHaveAttribute('data-loading', 'true');
    });
  });
});
