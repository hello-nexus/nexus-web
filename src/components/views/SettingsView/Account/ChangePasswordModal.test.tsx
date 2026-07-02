import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ChangePasswordModal } from './ChangePasswordModal';
import { ToastProvider } from '../../../common/Toast/Toast';
import type { CloudFetchResult, CloudPasswordResponse } from '../../../../api/cloud';

vi.mock('../../../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string | number>) => {
      let text = key;
      if (params) for (const [k, v] of Object.entries(params)) text += ` ${k}=${v}`;
      return text;
    },
  }),
}));

function renderModal(props: Partial<Parameters<typeof ChangePasswordModal>[0]> = {}) {
  const onClose = vi.fn();
  const onRecoveryFreshConsumed = vi.fn();
  const changePassword = vi.fn<(currentPassword: string | undefined, newPassword: string) => Promise<CloudFetchResult<CloudPasswordResponse>>>();
  const view = render(
    <ToastProvider>
      <ChangePasswordModal
        open
        onClose={onClose}
        recoveryFresh={false}
        onRecoveryFreshConsumed={onRecoveryFreshConsumed}
        changePassword={changePassword}
        {...props}
      />
    </ToastProvider>,
  );
  return { ...view, onClose, onRecoveryFreshConsumed, changePassword };
}

describe('ChangePasswordModal', () => {
  it('renders nothing when closed', () => {
    renderModal({ open: false });
    expect(screen.queryByText('account.password.change')).toBeNull();
  });

  it('shows the current-password field when the session is not recovery-fresh', () => {
    renderModal({ recoveryFresh: false });
    expect(screen.getByLabelText('account.password.current')).toBeInTheDocument();
    expect(screen.getByLabelText('account.password.new')).toBeInTheDocument();
    expect(screen.getByLabelText('account.password.confirm')).toBeInTheDocument();
  });

  it('hides the current-password field on a recovery-fresh session', () => {
    renderModal({ recoveryFresh: true });
    expect(screen.queryByLabelText('account.password.current')).toBeNull();
    expect(screen.getByLabelText('account.password.new')).toBeInTheDocument();
  });

  it('submits current + new password and closes on success', async () => {
    const { changePassword, onClose, onRecoveryFreshConsumed } = renderModal({ recoveryFresh: false });
    changePassword.mockResolvedValue({ status: 200, body: { error: false } });

    fireEvent.input(screen.getByLabelText('account.password.current'), { target: { value: 'oldPass1' } });
    fireEvent.input(screen.getByLabelText('account.password.new'), { target: { value: 'NewPass1' } });
    fireEvent.input(screen.getByLabelText('account.password.confirm'), { target: { value: 'NewPass1' } });
    fireEvent.click(screen.getByRole('button', { name: 'account.save' }));

    await waitFor(() => expect(changePassword).toHaveBeenCalledWith('oldPass1', 'NewPass1'));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onRecoveryFreshConsumed).toHaveBeenCalled();
  });

  it('sends no current password on a recovery-fresh submit', async () => {
    const { changePassword } = renderModal({ recoveryFresh: true });
    changePassword.mockResolvedValue({ status: 200, body: { error: false } });

    fireEvent.input(screen.getByLabelText('account.password.new'), { target: { value: 'NewPass1' } });
    fireEvent.input(screen.getByLabelText('account.password.confirm'), { target: { value: 'NewPass1' } });
    fireEvent.click(screen.getByRole('button', { name: 'account.save' }));

    await waitFor(() => expect(changePassword).toHaveBeenCalledWith(undefined, 'NewPass1'));
  });

  it('on a failed recovery-fresh submit, drops the flag, shows the expired error, and stays open', async () => {
    const { changePassword, onClose, onRecoveryFreshConsumed, rerender } = renderModal({ recoveryFresh: true });
    changePassword.mockResolvedValue({ status: 401, body: { error: true, msg: 'unauthorized' } });

    fireEvent.input(screen.getByLabelText('account.password.new'), { target: { value: 'NewPass1' } });
    fireEvent.input(screen.getByLabelText('account.password.confirm'), { target: { value: 'NewPass1' } });
    fireEvent.click(screen.getByRole('button', { name: 'account.save' }));

    await waitFor(() => expect(screen.getByText('account.error.recoverySessionExpired')).toBeInTheDocument());
    expect(onRecoveryFreshConsumed).toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();

    // The parent flips recoveryFresh to false in response to onRecoveryFreshConsumed;
    // the current-password field must reappear in this still-open modal.
    rerender(
      <ToastProvider>
        <ChangePasswordModal
          open
          onClose={onClose}
          recoveryFresh={false}
          onRecoveryFreshConsumed={onRecoveryFreshConsumed}
          changePassword={changePassword}
        />
      </ToastProvider>,
    );
    expect(screen.getByLabelText('account.password.current')).toBeInTheDocument();
  });

  it('on a wrong current password, shows the wrong-password error without touching recoveryFresh', async () => {
    const { changePassword, onRecoveryFreshConsumed } = renderModal({ recoveryFresh: false });
    changePassword.mockResolvedValue({ status: 401, body: { error: true, msg: 'unauthorized' } });

    fireEvent.input(screen.getByLabelText('account.password.current'), { target: { value: 'wrongPass1' } });
    fireEvent.input(screen.getByLabelText('account.password.new'), { target: { value: 'NewPass1' } });
    fireEvent.input(screen.getByLabelText('account.password.confirm'), { target: { value: 'NewPass1' } });
    fireEvent.click(screen.getByRole('button', { name: 'account.save' }));

    await waitFor(() => expect(screen.getByText('account.error.wrongPassword')).toBeInTheDocument());
    expect(onRecoveryFreshConsumed).not.toHaveBeenCalled();
  });

  it('disables submit until the new password is valid and confirmed', () => {
    renderModal({ recoveryFresh: false });
    const submit = screen.getByRole('button', { name: 'account.save' });
    expect(submit).toBeDisabled();

    fireEvent.input(screen.getByLabelText('account.password.current'), { target: { value: 'oldPass1' } });
    fireEvent.input(screen.getByLabelText('account.password.new'), { target: { value: 'weak' } });
    fireEvent.input(screen.getByLabelText('account.password.confirm'), { target: { value: 'weak' } });
    expect(submit).toBeDisabled();

    fireEvent.input(screen.getByLabelText('account.password.new'), { target: { value: 'NewPass1' } });
    fireEvent.input(screen.getByLabelText('account.password.confirm'), { target: { value: 'NewPass1' } });
    expect(submit).not.toBeDisabled();
  });

  it('clears all password fields before onClose unmounts the form via the header close button', () => {
    let currentAtCloseTime: string | null = null;
    let newAtCloseTime: string | null = null;
    let confirmAtCloseTime: string | null = null;
    const onClose = vi.fn(() => {
      currentAtCloseTime = (screen.getByLabelText('account.password.current') as HTMLInputElement).value;
      newAtCloseTime = (screen.getByLabelText('account.password.new') as HTMLInputElement).value;
      confirmAtCloseTime = (screen.getByLabelText('account.password.confirm') as HTMLInputElement).value;
    });
    renderModal({ recoveryFresh: false, onClose });

    fireEvent.input(screen.getByLabelText('account.password.current'), { target: { value: 'oldPass1' } });
    fireEvent.input(screen.getByLabelText('account.password.new'), { target: { value: 'NewPass1' } });
    fireEvent.input(screen.getByLabelText('account.password.confirm'), { target: { value: 'NewPass1' } });
    fireEvent.click(screen.getByRole('button', { name: 'app.window.close' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(currentAtCloseTime).toBe('');
    expect(newAtCloseTime).toBe('');
    expect(confirmAtCloseTime).toBe('');
  });

  it('clears new/confirm password before onClose on a recovery-fresh close (no current-password field)', () => {
    let newAtCloseTime: string | null = null;
    const onClose = vi.fn(() => {
      newAtCloseTime = (screen.getByLabelText('account.password.new') as HTMLInputElement).value;
    });
    renderModal({ recoveryFresh: true, onClose });

    fireEvent.input(screen.getByLabelText('account.password.new'), { target: { value: 'NewPass1' } });
    fireEvent.input(screen.getByLabelText('account.password.confirm'), { target: { value: 'NewPass1' } });
    fireEvent.click(screen.getByRole('button', { name: 'app.window.close' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(newAtCloseTime).toBe('');
  });
});
