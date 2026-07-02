import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AccountDangerZoneSection } from './AccountDangerZoneSection';
import type { AuthBackend } from '../../../../api/authBackend';

vi.mock('../../../../lib/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

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

describe('AccountDangerZoneSection logout', () => {
  it('calls backend.logout then onLoggedOut', async () => {
    const logout = vi.fn().mockResolvedValue(undefined);
    const onLoggedOut = vi.fn();
    render(
      <AccountDangerZoneSection
        backend={makeBackend({ logout })}
        recoveryFresh={false}
        onRecoveryFreshConsumed={vi.fn()}
        onLoggedOut={onLoggedOut}
        onDeleted={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'account.danger.logOut.label' }));

    await waitFor(() => expect(logout).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onLoggedOut).toHaveBeenCalledTimes(1));
  });
});

describe('AccountDangerZoneSection delete account', () => {
  it('requires a current-password field when not recovery-fresh, and calls onDeleted on success', async () => {
    const deleteAccount = vi.fn().mockResolvedValue({ status: 200, body: { error: false } });
    const onDeleted = vi.fn();
    render(
      <AccountDangerZoneSection
        backend={makeBackend({ deleteAccount })}
        recoveryFresh={false}
        onRecoveryFreshConsumed={vi.fn()}
        onLoggedOut={vi.fn()}
        onDeleted={onDeleted}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'account.danger.delete.button' }));
    expect(screen.getByLabelText('account.password.current')).toBeInTheDocument();

    fireEvent.input(screen.getByLabelText('account.password.current'), { target: { value: 'hunter2' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'account.danger.delete.button' })[1]);

    await waitFor(() => expect(deleteAccount).toHaveBeenCalledWith('hunter2'));
    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1));
  });

  it('omits the current-password field and sends no password when recovery-fresh', () => {
    render(
      <AccountDangerZoneSection
        backend={makeBackend()}
        recoveryFresh
        onRecoveryFreshConsumed={vi.fn()}
        onLoggedOut={vi.fn()}
        onDeleted={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'account.danger.delete.button' }));
    expect(screen.queryByLabelText('account.password.current')).toBeNull();
  });

  it('clears the password field before cancel unmounts the confirm modal', () => {
    render(
      <AccountDangerZoneSection
        backend={makeBackend()}
        recoveryFresh={false}
        onRecoveryFreshConsumed={vi.fn()}
        onLoggedOut={vi.fn()}
        onDeleted={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'account.danger.delete.button' }));
    const passwordInput = screen.getByLabelText('account.password.current') as HTMLInputElement;
    fireEvent.input(passwordInput, { target: { value: 'hunter2' } });
    fireEvent.click(screen.getByRole('button', { name: 'confirm.cancel' }));

    expect(screen.queryByLabelText('account.password.current')).toBeNull();
    // passwordInput is now detached, but the DOM node object still holds
    // whatever value it had at the moment it was removed.
    expect(passwordInput.value).toBe('');
  });

  it('cancel does not touch the recovery-fresh flag (no password field to clear)', () => {
    const onRecoveryFreshConsumed = vi.fn();
    render(
      <AccountDangerZoneSection
        backend={makeBackend()}
        recoveryFresh
        onRecoveryFreshConsumed={onRecoveryFreshConsumed}
        onLoggedOut={vi.fn()}
        onDeleted={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'account.danger.delete.button' }));
    fireEvent.click(screen.getByRole('button', { name: 'confirm.cancel' }));

    expect(screen.queryByText('account.danger.delete.confirmTitle')).toBeNull();
    expect(onRecoveryFreshConsumed).not.toHaveBeenCalled();
  });
});
