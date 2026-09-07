import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AccountView } from './AccountView';
import { ToastProvider } from '../../../common/Toast/Toast';
import type { UseCloudAccountsResult } from '../../../../hooks/useCloudAccounts';
import type { UseSyncStatusResult } from '../../../../hooks/useSyncStatus';
import type { CloudAccountSummary } from '../../../../api/cloud';

vi.mock('../../../../lib/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const localLogin = vi.fn();
vi.mock('../../../../api/localServiceBackend', () => ({
  localServiceBackend: {
    login: (...args: [string, string]) => localLogin(...args),
    register: vi.fn(),
    logout: vi.fn(),
    getAccount: vi.fn(),
    recoveryStart: vi.fn(),
    recoveryStatus: vi.fn(),
    changePassword: vi.fn(),
    changeUsername: vi.fn(),
    setPrivate: vi.fn(),
    deleteAccount: vi.fn(),
    uploadAvatar: vi.fn(),
  },
}));

const ACCOUNT: CloudAccountSummary = {
  accountId: 'acct-1',
  email: 'alpha@example.com',
  username: 'alpha',
  avatar: null,
  isPrivate: false,
  emailVerified: true,
};

function makeAccounts(activeAccountId: string | null): UseCloudAccountsResult {
  return {
    activeAccountId,
    activeAccount: activeAccountId ? ACCOUNT : null,
    refresh: vi.fn(),
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

function renderView(tab: string | null, activeAccountId: string | null = null) {
  return render(
    <ToastProvider>
      <AccountView
        serviceOnline
        accounts={makeAccounts(activeAccountId)}
        sync={SYNC}
        tab={tab}
        onTabChange={vi.fn()}
      />
    </ToastProvider>,
  );
}

describe('AccountView route-driven signed-out subtab', () => {
  it('renders sign-in for a null tab', () => {
    renderView(null);
    expect(screen.getByRole('button', { name: 'account.signIn.submit' })).toBeInTheDocument();
  });

  it('renders sign-in for an unrecognized tab value', () => {
    renderView('bogus');
    expect(screen.getByRole('button', { name: 'account.signIn.submit' })).toBeInTheDocument();
  });

  it('renders the register flow for tab=register', () => {
    renderView('register');
    expect(screen.getByRole('button', { name: 'account.create.submit' })).toBeInTheDocument();
  });

  it('renders the forgot-password flow for tab=recover', () => {
    renderView('recover');
    expect(screen.getByRole('button', { name: 'account.recovery.submit' })).toBeInTheDocument();
  });
});

describe('AccountView signed-in state', () => {
  it('ignores the tab prop and renders the signed-in account page once an account is active', () => {
    renderView('register', 'acct-1');
    expect(screen.getByText('account.authentication.title')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'account.create.submit' })).toBeNull();
  });
});

describe('AccountView sign-in refreshes the accounts hook', () => {
  it('calls accounts.refresh() after a successful sign-in submit', async () => {
    localLogin.mockClear().mockResolvedValue({ status: 200, body: null });
    const accounts = makeAccounts(null);
    render(
      <ToastProvider>
        <AccountView serviceOnline accounts={accounts} sync={SYNC} tab={null} onTabChange={vi.fn()} />
      </ToastProvider>,
    );

    fireEvent.input(screen.getByLabelText('account.signIn.identifier'), { target: { value: 'alice' } });
    fireEvent.input(screen.getByLabelText('account.signIn.password'), { target: { value: 'hunter22' } });
    fireEvent.click(screen.getByRole('button', { name: 'account.signIn.submit' }));

    await waitFor(() => expect(accounts.refresh).toHaveBeenCalled());
  });
});

describe('AccountView tabs', () => {
  it('keeps the account sections on the first tab and purchases on the second', async () => {
    const { unmount } = renderView(null, 'acct-1');

    expect(await screen.findByText('account.authentication.title')).toBeInTheDocument();
    expect(screen.queryByText('account.purchases.title')).toBeNull();
    unmount();

    renderView('purchases', 'acct-1');

    expect(await screen.findByText('account.purchases.title')).toBeInTheDocument();
    expect(screen.queryByText('account.authentication.title')).toBeNull();
  });
});

describe('AccountView recovery-fresh session', () => {
  // The modal title repeats the row button's label, so one match means closed
  // and two means open. `recoveryFresh` reaching the modal is asserted by the
  // absence of the current-password field once it IS open, which also proves
  // the recoveryStatus read still works.
  const openModal = () => fireEvent.click(screen.getByRole('button', { name: 'account.password.change' }));

  it('never opens the change-password modal, however many times the page is opened', async () => {
    const { localServiceBackend } = await import('../../../../api/localServiceBackend');
    vi.mocked(localServiceBackend.recoveryStatus).mockResolvedValue({ status: 'idle', recoveryFresh: true });

    const first = renderView(null, 'acct-1');
    await act(async () => { await Promise.resolve(); });
    expect(screen.getAllByText('account.password.change')).toHaveLength(1);
    first.unmount();

    // The reopen-on-every-load regression: a second visit inside the same
    // 30-minute service window must still land closed, with the window live.
    renderView(null, 'acct-1');
    await act(async () => { await Promise.resolve(); });
    expect(screen.getAllByText('account.password.change')).toHaveLength(1);

    openModal();
    expect(screen.getAllByText('account.password.change')).toHaveLength(2);
    expect(screen.queryByLabelText('account.password.current')).toBeNull();
  });

  it('asks for the current password when the window is not fresh', async () => {
    const { localServiceBackend } = await import('../../../../api/localServiceBackend');
    vi.mocked(localServiceBackend.recoveryStatus).mockResolvedValue({ status: 'idle', recoveryFresh: false });

    renderView(null, 'acct-1');
    await act(async () => { await Promise.resolve(); });
    expect(screen.getAllByText('account.password.change')).toHaveLength(1);

    openModal();
    expect(screen.getByLabelText('account.password.current')).toBeInTheDocument();
  });
});
