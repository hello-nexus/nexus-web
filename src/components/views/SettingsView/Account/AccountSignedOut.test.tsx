import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AccountSignedOut } from './AccountSignedOut';
import type { AuthBackend } from '../../../../api/authBackend';

vi.mock('../../../../lib/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

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

describe('AccountSignedOut subtab routing', () => {
  it('renders the sign-in form when the subtab is null', () => {
    render(<AccountSignedOut backend={makeBackend()} subtab={null} onSubtabChange={vi.fn()} onRecoveryApproved={vi.fn()} onSignedIn={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'account.signIn.submit' })).toBeInTheDocument();
  });

  it('renders the register flow when the subtab is register', () => {
    render(<AccountSignedOut backend={makeBackend()} subtab="register" onSubtabChange={vi.fn()} onRecoveryApproved={vi.fn()} onSignedIn={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'account.create.submit' })).toBeInTheDocument();
  });

  it('renders the forgot-password flow when the subtab is recover', () => {
    render(<AccountSignedOut backend={makeBackend()} subtab="recover" onSubtabChange={vi.fn()} onRecoveryApproved={vi.fn()} onSignedIn={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'account.recovery.submit' })).toBeInTheDocument();
  });

  it('navigates to the register subtab via onSubtabChange when "create account" is clicked', () => {
    const onSubtabChange = vi.fn();
    render(<AccountSignedOut backend={makeBackend()} subtab={null} onSubtabChange={onSubtabChange} onRecoveryApproved={vi.fn()} onSignedIn={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'account.signIn.createAccount' }));

    expect(onSubtabChange).toHaveBeenCalledWith('register');
  });

  it('navigates to the recover subtab via onSubtabChange when "forgot password" is clicked', () => {
    const onSubtabChange = vi.fn();
    render(<AccountSignedOut backend={makeBackend()} subtab={null} onSubtabChange={onSubtabChange} onRecoveryApproved={vi.fn()} onSignedIn={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'account.signIn.forgotPassword' }));

    expect(onSubtabChange).toHaveBeenCalledWith('recover');
  });

  it('navigates back to login via onSubtabChange from the register flow', () => {
    const onSubtabChange = vi.fn();
    render(<AccountSignedOut backend={makeBackend()} subtab="register" onSubtabChange={onSubtabChange} onRecoveryApproved={vi.fn()} onSignedIn={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'account.signIn.backToSignIn' }));

    expect(onSubtabChange).toHaveBeenCalledWith('login');
  });
});

describe('AccountSignedOut onSignedIn wiring', () => {
  it('fires onSignedIn once a sign-in submit succeeds', async () => {
    const onSignedIn = vi.fn();
    const login = vi.fn().mockResolvedValue({ status: 200, body: null });
    render(<AccountSignedOut backend={makeBackend({ login })} subtab={null} onSubtabChange={vi.fn()} onRecoveryApproved={vi.fn()} onSignedIn={onSignedIn} />);

    fireEvent.input(screen.getByLabelText('account.signIn.identifier'), { target: { value: 'alice' } });
    fireEvent.input(screen.getByLabelText('account.signIn.password'), { target: { value: 'hunter22' } });
    fireEvent.click(screen.getByRole('button', { name: 'account.signIn.submit' }));

    await waitFor(() => expect(onSignedIn).toHaveBeenCalledTimes(1));
  });

  it('fires onSignedIn once the register flow\'s "I\'ve verified" retry logs in', async () => {
    const onSignedIn = vi.fn();
    const login = vi.fn().mockResolvedValue({ status: 200, body: null });
    const register = vi.fn().mockResolvedValue({ status: 200, body: { error: false } });
    render(<AccountSignedOut backend={makeBackend({ login, register })} subtab="register" onSubtabChange={vi.fn()} onRecoveryApproved={vi.fn()} onSignedIn={onSignedIn} />);

    fireEvent.input(screen.getByLabelText('account.create.email'), { target: { value: 'alice@example.com' } });
    fireEvent.input(screen.getByLabelText('account.create.username'), { target: { value: 'alice' } });
    fireEvent.input(screen.getByLabelText('account.create.password'), { target: { value: 'Hunter22' } });
    fireEvent.input(screen.getByLabelText('account.create.confirmPassword'), { target: { value: 'Hunter22' } });
    fireEvent.click(screen.getByRole('button', { name: 'account.create.submit' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'account.create.verifiedRetry' })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'account.create.verifiedRetry' }));

    await waitFor(() => expect(onSignedIn).toHaveBeenCalledTimes(1));
  });
});
