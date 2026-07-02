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
    recoveryStart: vi.fn().mockResolvedValue({ grantId: 'grant-1' }),
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
