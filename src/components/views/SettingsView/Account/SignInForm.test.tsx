import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SignInForm } from './SignInForm';

vi.mock('../../../../lib/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const storeLoginCredential = vi.fn().mockResolvedValue(undefined);
vi.mock('./credentialStore', () => ({
  storeLoginCredential: (identifier: string, password: string) => storeLoginCredential(identifier, password),
}));

function fillAndSubmit(identifier: string, password: string) {
  fireEvent.input(screen.getByLabelText('account.signIn.identifier'), { target: { value: identifier } });
  fireEvent.input(screen.getByLabelText('account.signIn.password'), { target: { value: password } });
  fireEvent.click(screen.getByRole('button', { name: 'account.signIn.submit' }));
}

describe('SignInForm password manager handoff', () => {
  beforeEach(() => {
    storeLoginCredential.mockClear();
  });

  it('hands the credential to the browser password manager on a successful login', async () => {
    const login = vi.fn().mockResolvedValue({ status: 200, body: null });
    const onSuccess = vi.fn();
    render(<SignInForm backend={{ login } as never} onSuccess={onSuccess} />);

    fillAndSubmit('alice', 'hunter2');

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(storeLoginCredential).toHaveBeenCalledWith('alice', 'hunter2');
  });

  it('does not store a credential when the login fails', async () => {
    const login = vi.fn().mockResolvedValue({ status: 401, body: { error: true, msg: 'invalid_credentials' } });
    render(<SignInForm backend={{ login } as never} onSuccess={vi.fn()} />);

    fillAndSubmit('alice', 'wrong');

    await waitFor(() => expect(login).toHaveBeenCalledTimes(1));
    expect(storeLoginCredential).not.toHaveBeenCalled();
  });
});

describe('SignInForm errors', () => {
  it('says the account is locked when the api reports too many sign-in attempts', async () => {
    const login = vi.fn().mockResolvedValue({ status: 429, body: { error: true, msg: 'login_locked' } });
    render(<SignInForm backend={{ login } as never} onSuccess={vi.fn()} />);

    fillAndSubmit('alice', 'wrong');

    expect(await screen.findByText('account.error.loginLocked')).toBeTruthy();
  });
});

describe('SignInForm unverified state', () => {
  it('offers resend when signing in with an email address', async () => {
    const login = vi.fn().mockResolvedValue({ status: 403, body: { error: true, msg: 'email_unverified' } });
    render(<SignInForm backend={{ login, resendVerification: vi.fn() } as never} onSuccess={vi.fn()} />);

    fillAndSubmit('alice@example.com', 'pw');

    const resend = await screen.findByRole('button', { name: 'account.verify.resend' });
    expect((resend as HTMLButtonElement).disabled).toBe(false);
  });

  it('hides resend when the identifier is a username, which the api cannot resolve', async () => {
    const login = vi.fn().mockResolvedValue({ status: 403, body: { error: true, msg: 'email_unverified' } });
    render(<SignInForm backend={{ login, resendVerification: vi.fn() } as never} onSuccess={vi.fn()} />);

    fillAndSubmit('alice', 'pw');

    await screen.findByText('account.verify.pendingMessage');
    expect(screen.queryByRole('button', { name: /account\.verify\.resend/ })).toBeNull();
  });

  it('offers resend for a username sign-in when the api returns the email', async () => {
    const login = vi.fn().mockResolvedValue({ status: 403, body: { error: true, msg: 'email_unverified', email: 'alice@example.com' } });
    const resendVerification = vi.fn().mockResolvedValue('ok');
    render(<SignInForm backend={{ login, resendVerification } as never} onSuccess={vi.fn()} />);

    fillAndSubmit('alice', 'pw');

    fireEvent.click(await screen.findByRole('button', { name: 'account.verify.resend' }));
    await waitFor(() => expect(resendVerification).toHaveBeenCalledWith('alice@example.com'));
  });
});
