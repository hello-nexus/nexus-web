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
    recoveryStart: vi.fn().mockResolvedValue({ grantId: 'grant-1', code: 'ABC-DEF' }),
    recoveryStatus: vi.fn().mockResolvedValue({ status: 'pending' }),
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

describe('ForgotPasswordFlow code display', () => {
  it('shows the code the start returned, which is what the link page will ask for', async () => {
    render(
      <ForgotPasswordFlow
        backend={makeBackend()}
        onBackToSignIn={vi.fn()}
        onRecoveryApproved={vi.fn()}
      />,
    );

    fireEvent.input(screen.getByLabelText('account.recovery.email'), { target: { value: 'user@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'account.recovery.submit' }));

    await waitFor(() => expect(screen.getByText('ABC-DEF')).toBeInTheDocument());
  });

  it('treats a start that returned no code as a failure, not a pending flow', async () => {
    render(
      <ForgotPasswordFlow
        backend={makeBackend({ recoveryStart: vi.fn().mockResolvedValue({ grantId: 'grant-1' }) })}
        onBackToSignIn={vi.fn()}
        onRecoveryApproved={vi.fn()}
      />,
    );

    fireEvent.input(screen.getByLabelText('account.recovery.email'), { target: { value: 'user@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'account.recovery.submit' }));

    await waitFor(() => expect(screen.getByText('account.recovery.startFailed')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'account.recovery.cancel' })).not.toBeInTheDocument();
  });
});

describe('ForgotPasswordFlow refused start', () => {
  it('keeps the email form and reports the failure instead of polling for a link that was never sent', async () => {
    render(
      <ForgotPasswordFlow
        backend={makeBackend({ recoveryStart: vi.fn().mockResolvedValue(null) })}
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
