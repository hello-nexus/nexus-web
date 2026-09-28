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

  it('asks for no current password, and says an email will confirm when not recovery-fresh', () => {
    renderModal({ recoveryFresh: false });
    expect(screen.queryByLabelText('account.password.current')).toBeNull();
    expect(screen.getByText('account.password.confirmHint')).toBeInTheDocument();
    expect(screen.getByLabelText('account.password.new')).toBeInTheDocument();
    expect(screen.getByLabelText('account.password.confirm')).toBeInTheDocument();
  });

  it('omits the email hint on a recovery-fresh session', () => {
    renderModal({ recoveryFresh: true });
    expect(screen.queryByText('account.password.confirmHint')).toBeNull();
  });

  function submitNewPassword(value = 'NewPass1') {
    fireEvent.input(screen.getByLabelText('account.password.new'), { target: { value } });
    fireEvent.input(screen.getByLabelText('account.password.confirm'), { target: { value } });
    fireEvent.click(screen.getByRole('button', { name: 'account.save' }));
  }

  it('on 202, stays open and tells the user to click the emailed link', async () => {
    const { changePassword, onClose, onRecoveryFreshConsumed } = renderModal({ recoveryFresh: false });
    changePassword.mockResolvedValue({ status: 202, body: { error: false } });

    submitNewPassword();

    await waitFor(() => expect(screen.getByText('account.password.confirmSent')).toBeInTheDocument());
    expect(changePassword).toHaveBeenCalledWith(undefined, 'NewPass1');
    expect(onRecoveryFreshConsumed).toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('account.password.new')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'confirm.ok' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('shows the empty form again when reopened after an email was sent', async () => {
    const { changePassword, onClose, onRecoveryFreshConsumed, rerender } = renderModal({ recoveryFresh: false });
    changePassword.mockResolvedValue({ status: 202, body: { error: false } });
    submitNewPassword();
    await waitFor(() => expect(screen.getByText('account.password.confirmSent')).toBeInTheDocument());

    const modal = (open: boolean) => (
      <ToastProvider>
        <ChangePasswordModal
          open={open}
          onClose={onClose}
          recoveryFresh={false}
          onRecoveryFreshConsumed={onRecoveryFreshConsumed}
          changePassword={changePassword}
        />
      </ToastProvider>
    );
    rerender(modal(false));
    rerender(modal(true));

    expect(screen.queryByText('account.password.confirmSent')).toBeNull();
    expect(screen.getByLabelText('account.password.new')).toHaveValue('');
  });

  it('on an applied change, toasts the updated notice', async () => {
    const { changePassword, onClose } = renderModal({ recoveryFresh: true });
    changePassword.mockResolvedValue({ status: 200, body: { error: false } });

    submitNewPassword();

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(screen.getByText('account.password.updated')).toBeInTheDocument();
  });

  it('on 429, says a confirmation was just sent and stays open', async () => {
    const { changePassword, onClose } = renderModal();
    changePassword.mockResolvedValue({ status: 429, body: { error: true, msg: 'password_change_too_soon' } });

    submitNewPassword();

    await waitFor(() => expect(screen.getByText('account.error.passwordChangeTooSoon')).toBeInTheDocument());
    expect(onClose).not.toHaveBeenCalled();
  });

  it('on any other failure, shows the generic error', async () => {
    const { changePassword } = renderModal();
    changePassword.mockResolvedValue({ status: 0, body: null });

    submitNewPassword();

    await waitFor(() => expect(screen.getByText('account.error.generic')).toBeInTheDocument());
  });

  it('disables submit until the new password is valid and confirmed', () => {
    renderModal({ recoveryFresh: false });
    const submit = screen.getByRole('button', { name: 'account.save' });
    expect(submit).toBeDisabled();

    fireEvent.input(screen.getByLabelText('account.password.new'), { target: { value: 'weak' } });
    fireEvent.input(screen.getByLabelText('account.password.confirm'), { target: { value: 'weak' } });
    expect(submit).toBeDisabled();

    fireEvent.input(screen.getByLabelText('account.password.new'), { target: { value: 'NewPass1' } });
    fireEvent.input(screen.getByLabelText('account.password.confirm'), { target: { value: 'NewPass1' } });
    expect(submit).not.toBeDisabled();
  });
});
