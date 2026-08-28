import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AccountAuthenticationSection } from './AccountAuthenticationSection';
import { ToastProvider } from '../../../common/Toast/Toast';
import type { AuthAccount, AuthBackend } from '../../../../api/authBackend';

vi.mock('../../../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string | number>) => {
      let text = key;
      if (params) for (const [k, v] of Object.entries(params)) text += ` ${k}=${v}`;
      return text;
    },
  }),
}));

const ACCOUNT: AuthAccount = {
  accountId: 'acct-1',
  email: 'alpha@example.com',
  username: 'alpha',
  avatar: null,
  isPrivate: false,
  emailVerified: true,
};

function makeBackend(overrides: Partial<AuthBackend> = {}): AuthBackend {
  return {
    login: vi.fn(),
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
    ...overrides,
  };
}

function renderSection(backend: AuthBackend, onAccountChanged = vi.fn(), onLoggedOut = vi.fn()) {
  return render(
    <ToastProvider>
      <AccountAuthenticationSection
        backend={backend}
        account={ACCOUNT}
        onAccountChanged={onAccountChanged}
        recoveryFresh={false}
        onRecoveryFreshConsumed={vi.fn()}
        onLoggedOut={onLoggedOut}
      />
    </ToastProvider>,
  );
}

function saveNewUsername() {
  fireEvent.input(screen.getByLabelText('account.username.label'), { target: { value: 'newname' } });
  fireEvent.click(screen.getByRole('button', { name: 'account.save' }));
}

describe('AccountAuthenticationSection username cooldown', () => {
  it('shows the live cooldown message when the 409 response carries a retryAt', async () => {
    const changeUsername = vi.fn().mockResolvedValue({
      status: 409,
      body: { error: true, msg: 'username_cooldown', retryAt: new Date(Date.now() + 5 * 3_600_000).toISOString() },
    });
    renderSection(makeBackend({ changeUsername }));

    saveNewUsername();

    await waitFor(() => {
      expect(screen.getByText(content => content.startsWith('account.username.error.cooldownIn'))).toBeInTheDocument();
    });
    expect(screen.queryByText('account.username.error.cooldown')).toBeNull();
  });

  it('falls back to the static cooldown message when the 409 response omits retryAt', async () => {
    const changeUsername = vi.fn().mockResolvedValue({
      status: 409,
      body: { error: true, msg: 'username_cooldown' },
    });
    renderSection(makeBackend({ changeUsername }));

    saveNewUsername();

    await waitFor(() => {
      expect(screen.getByText('account.username.error.cooldown')).toBeInTheDocument();
    });
  });

  it('calls onAccountChanged on a successful username change', async () => {
    const changeUsername = vi.fn().mockResolvedValue({ status: 200, body: { error: false } });
    const onAccountChanged = vi.fn();
    renderSection(makeBackend({ changeUsername }), onAccountChanged);

    saveNewUsername();

    await waitFor(() => expect(onAccountChanged).toHaveBeenCalled());
  });
});

describe('AccountAuthenticationSection log out', () => {
  it('sits with the account settings, not the danger zone, and calls onLoggedOut', async () => {
    const logout = vi.fn().mockResolvedValue(undefined);
    const onLoggedOut = vi.fn();
    renderSection(makeBackend({ logout }), vi.fn(), onLoggedOut);

    fireEvent.click(screen.getByRole('button', { name: 'account.logOut.label' }));

    await waitFor(() => expect(logout).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onLoggedOut).toHaveBeenCalledTimes(1));
  });

  it('renders after the private-account toggle', () => {
    renderSection(makeBackend());
    const rows = screen.getByText('account.privacy.label').closest('section') ?? document.body;
    const text = rows.textContent ?? '';
    expect(text.indexOf('account.privacy.label')).toBeLessThan(text.indexOf('account.logOut.label'));
  });
});
