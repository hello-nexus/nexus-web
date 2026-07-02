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

describe('SignInForm navigation clears fields before unmount', () => {
  it('clears identifier and password before onForgotPassword unmounts the form', () => {
    let identifierAtNavTime: string | null = null;
    let passwordAtNavTime: string | null = null;
    const onForgotPassword = vi.fn(() => {
      identifierAtNavTime = (screen.getByLabelText('account.signIn.identifier') as HTMLInputElement).value;
      passwordAtNavTime = (screen.getByLabelText('account.signIn.password') as HTMLInputElement).value;
    });
    render(
      <SignInForm backend={{ login: vi.fn() } as never} onSuccess={vi.fn()} onForgotPassword={onForgotPassword} />,
    );

    fireEvent.input(screen.getByLabelText('account.signIn.identifier'), { target: { value: 'alice' } });
    fireEvent.input(screen.getByLabelText('account.signIn.password'), { target: { value: 'hunter2' } });
    fireEvent.click(screen.getByRole('button', { name: 'account.signIn.forgotPassword' }));

    expect(onForgotPassword).toHaveBeenCalledTimes(1);
    expect(identifierAtNavTime).toBe('');
    expect(passwordAtNavTime).toBe('');
  });

  it('clears identifier and password before onCreateAccount unmounts the form', () => {
    let passwordAtNavTime: string | null = null;
    const onCreateAccount = vi.fn(() => {
      passwordAtNavTime = (screen.getByLabelText('account.signIn.password') as HTMLInputElement).value;
    });
    render(
      <SignInForm backend={{ login: vi.fn() } as never} onSuccess={vi.fn()} onCreateAccount={onCreateAccount} />,
    );

    fireEvent.input(screen.getByLabelText('account.signIn.identifier'), { target: { value: 'alice' } });
    fireEvent.input(screen.getByLabelText('account.signIn.password'), { target: { value: 'hunter2' } });
    fireEvent.click(screen.getByRole('button', { name: 'account.signIn.createAccount' }));

    expect(onCreateAccount).toHaveBeenCalledTimes(1);
    expect(passwordAtNavTime).toBe('');
  });
});
