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
    const onLogin = vi.fn().mockResolvedValue({ status: 200, body: null });
    const onSuccess = vi.fn();
    render(<SignInForm onLogin={onLogin} onSuccess={onSuccess} />);

    fillAndSubmit('alice', 'hunter2');

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(storeLoginCredential).toHaveBeenCalledWith('alice', 'hunter2');
  });

  it('does not store a credential when the login fails', async () => {
    const onLogin = vi.fn().mockResolvedValue({ status: 401, body: { error: true, msg: 'invalid_credentials' } });
    render(<SignInForm onLogin={onLogin} onSuccess={vi.fn()} />);

    fillAndSubmit('alice', 'wrong');

    await waitFor(() => expect(onLogin).toHaveBeenCalledTimes(1));
    expect(storeLoginCredential).not.toHaveBeenCalled();
  });
});
