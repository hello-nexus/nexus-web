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

describe('AccountDangerZoneSection delete account', () => {
  it('requires a current-password field when not recovery-fresh, and calls onDeleted on success', async () => {
    const deleteAccount = vi.fn().mockResolvedValue({ status: 200, body: { error: false } });
    const onDeleted = vi.fn();
    render(
      <AccountDangerZoneSection
        backend={makeBackend({ deleteAccount })}
        recoveryFresh={false}
        onRecoveryFreshConsumed={vi.fn()}
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
        onDeleted={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'account.danger.delete.button' }));
    expect(screen.queryByLabelText('account.password.current')).toBeNull();
  });
});
