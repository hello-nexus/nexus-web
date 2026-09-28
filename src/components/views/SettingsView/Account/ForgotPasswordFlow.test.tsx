import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ForgotPasswordFlow } from './ForgotPasswordFlow';
import type { AuthBackend } from '../../../../api/authBackend';

vi.mock('../../../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string | number>) => {
      let text = key;
      if (params) for (const [k, v] of Object.entries(params)) text += ` ${k}=${v}`;
      return text;
    },
  }),
}));

function makeBackend(overrides: Partial<AuthBackend> = {}): AuthBackend {
  return {
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    getAccount: vi.fn(),
    recoveryStart: vi.fn().mockResolvedValue(true),
    recoveryStatus: vi.fn().mockResolvedValue({ status: 'pending' }),
    recoverySubmitCode: vi.fn().mockResolvedValue('ok'),
    changePassword: vi.fn(),
    changeUsername: vi.fn(),
    setPrivate: vi.fn(),
    deleteAccount: vi.fn(),
    uploadAvatar: vi.fn(),
    ...overrides,
  };
}

describe('ForgotPasswordFlow cancel', () => {
  it('discards the backend recovery grant and returns to the email form', async () => {
    const recoveryCancel = vi.fn();
    render(
      <ForgotPasswordFlow
        backend={makeBackend({ recoveryCancel })}
        onBackToSignIn={vi.fn()}
        onRecoveryApproved={vi.fn()}
      />,
    );

    fireEvent.input(screen.getByLabelText('account.recovery.email'), { target: { value: 'user@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'account.recovery.submit' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'account.recovery.cancel' })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'account.recovery.cancel' }));

    expect(recoveryCancel).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'account.recovery.submit' })).toBeInTheDocument();
  });

  it('tolerates a backend with no recoveryCancel implementation', async () => {
    render(
      <ForgotPasswordFlow
        backend={makeBackend()}
        onBackToSignIn={vi.fn()}
        onRecoveryApproved={vi.fn()}
      />,
    );

    fireEvent.input(screen.getByLabelText('account.recovery.email'), { target: { value: 'user@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'account.recovery.submit' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'account.recovery.cancel' })).toBeInTheDocument());
    expect(() => fireEvent.click(screen.getByRole('button', { name: 'account.recovery.cancel' }))).not.toThrow();
  });
});

describe('ForgotPasswordFlow code entry', () => {
  async function startPending(backend: AuthBackend, onRecoveryApproved = vi.fn()) {
    render(<ForgotPasswordFlow backend={backend} onBackToSignIn={vi.fn()} onRecoveryApproved={onRecoveryApproved} />);
    fireEvent.input(screen.getByLabelText('account.recovery.email'), { target: { value: 'user@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'account.recovery.submit' }));
    await waitFor(() => expect(screen.getByLabelText('account.recovery.codeTitle')).toBeInTheDocument());
    return onRecoveryApproved;
  }

  it('shows no code of its own, only the field for the one the link shows', async () => {
    await startPending(makeBackend());
    expect(screen.getByText('account.recovery.pendingHowTo')).toBeInTheDocument();
    expect(screen.queryByText('devices.specs.copy')).not.toBeInTheDocument();
  });

  it('keeps digits only, groups them, and submits on the sixth', async () => {
    const recoverySubmitCode = vi.fn().mockResolvedValue('ok');
    const approved = await startPending(makeBackend({ recoverySubmitCode }));
    const field = screen.getByLabelText('account.recovery.codeTitle') as HTMLInputElement;

    fireEvent.input(field, { target: { value: '48a 2' } });
    expect(field.value).toBe('482');
    expect(recoverySubmitCode).not.toHaveBeenCalled();

    fireEvent.input(field, { target: { value: '482915' } });
    await waitFor(() => expect(recoverySubmitCode).toHaveBeenCalledWith('482915'));
    await waitFor(() => expect(approved).toHaveBeenCalledTimes(1));
    expect(screen.getByText('account.recovery.signingIn')).toBeInTheDocument();
  });

  it('marks a wrong code and waits for another', async () => {
    const recoverySubmitCode = vi.fn().mockResolvedValue('mismatch');
    await startPending(makeBackend({ recoverySubmitCode }));

    fireEvent.input(screen.getByLabelText('account.recovery.codeTitle'), { target: { value: '000000' } });

    await waitFor(() => expect(screen.getByText('account.recovery.codeWrong')).toBeInTheDocument());
    expect(screen.getByLabelText('account.recovery.codeTitle')).toBeInTheDocument();
  });

  it('does not blame the code when the request itself failed', async () => {
    const recoverySubmitCode = vi.fn().mockResolvedValue('failed');
    await startPending(makeBackend({ recoverySubmitCode }));

    fireEvent.input(screen.getByLabelText('account.recovery.codeTitle'), { target: { value: '000000' } });

    await waitFor(() => expect(screen.getByText('account.error.generic')).toBeInTheDocument());
    expect(screen.queryByText('account.recovery.codeWrong')).not.toBeInTheDocument();
  });

  it('sends the link again on request and clears the half-typed code', async () => {
    const recoveryStart = vi.fn().mockResolvedValue(true);
    await startPending(makeBackend({ recoveryStart }));
    fireEvent.input(screen.getByLabelText('account.recovery.codeTitle'), { target: { value: '482' } });

    fireEvent.click(screen.getByRole('button', { name: 'account.recovery.resend' }));

    await waitFor(() => expect(screen.getByText('account.recovery.resent')).toBeInTheDocument());
    expect(recoveryStart).toHaveBeenCalledTimes(2);
    expect(recoveryStart).toHaveBeenLastCalledWith('user@example.com');
    expect((screen.getByLabelText('account.recovery.codeTitle') as HTMLInputElement).value).toBe('');
  });

  it('sends one email for a double click on resend', async () => {
    let finish: (ok: boolean) => void = () => {};
    const recoveryStart = vi.fn()
      .mockResolvedValueOnce(true)
      .mockReturnValueOnce(new Promise<boolean>((resolve) => { finish = resolve; }));
    await startPending(makeBackend({ recoveryStart }));
    const resendBtn = screen.getByRole('button', { name: 'account.recovery.resend' });

    fireEvent.click(resendBtn);
    fireEvent.click(resendBtn);
    finish(true);

    await waitFor(() => expect(screen.getByText('account.recovery.resent')).toBeInTheDocument());
    expect(recoveryStart).toHaveBeenCalledTimes(2);
  });

  it('says so when a resend is refused, and keeps waiting on the link already sent', async () => {
    const recoveryStart = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    await startPending(makeBackend({ recoveryStart }));

    fireEvent.click(screen.getByRole('button', { name: 'account.recovery.resend' }));

    await waitFor(() => expect(screen.getByText('account.recovery.startFailed')).toBeInTheDocument());
    expect(screen.getByLabelText('account.recovery.codeTitle')).toBeInTheDocument();
  });

  it('sends the user back to start over once the guesses are spent', async () => {
    const recoverySubmitCode = vi.fn().mockResolvedValue('exhausted');
    await startPending(makeBackend({ recoverySubmitCode }));

    fireEvent.input(screen.getByLabelText('account.recovery.codeTitle'), { target: { value: '000000' } });

    await waitFor(() => expect(screen.getByText('account.recovery.exhaustedTitle')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'account.recovery.tryAgain' })).toBeInTheDocument();
  });
});

describe('ForgotPasswordFlow refused start', () => {
  it('keeps the email form and reports the failure instead of polling for a link that was never sent', async () => {
    render(
      <ForgotPasswordFlow
        backend={makeBackend({ recoveryStart: vi.fn().mockResolvedValue(false) })}
        onBackToSignIn={vi.fn()}
        onRecoveryApproved={vi.fn()}
      />,
    );

    fireEvent.input(screen.getByLabelText('account.recovery.email'), { target: { value: 'user@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'account.recovery.submit' }));

    await waitFor(() => expect(screen.getByText('account.recovery.startFailed')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'account.recovery.submit' })).toBeInTheDocument();
    expect(screen.queryByText('account.recovery.expiredTitle')).not.toBeInTheDocument();
  });
});
