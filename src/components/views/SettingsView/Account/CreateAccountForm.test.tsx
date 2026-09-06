import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CreateAccountForm } from './CreateAccountForm';

vi.mock('../../../../lib/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

function fillAndSubmit(username = 'alpha_1') {
  fireEvent.input(screen.getByLabelText('account.create.email'), { target: { value: 'alpha@example.com' } });
  fireEvent.input(screen.getByLabelText('account.create.username'), { target: { value: username } });
  fireEvent.input(screen.getByLabelText('account.create.password'), { target: { value: 'Hunter2hunter' } });
  fireEvent.input(screen.getByLabelText('account.create.confirmPassword'), { target: { value: 'Hunter2hunter' } });
  fireEvent.click(screen.getByRole('button', { name: 'account.create.submit' }));
}

describe('CreateAccountForm username taken', () => {
  it('marks the username field invalid with the error under it, and clears on edit', async () => {
    const register = vi.fn().mockResolvedValue({ status: 409, body: { error: true, msg: 'username_taken' } });
    render(<CreateAccountForm backend={{ register } as never} onSuccess={vi.fn()} />);

    fillAndSubmit();

    await waitFor(() => expect(register).toHaveBeenCalledTimes(1));
    const username = screen.getByLabelText('account.create.username');
    expect(username.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByText('account.error.usernameTaken')).toBeTruthy();
    expect(screen.getByLabelText('account.create.email').getAttribute('aria-invalid')).toBeNull();

    fireEvent.input(username, { target: { value: 'alpha_2' } });
    expect(username.getAttribute('aria-invalid')).toBeNull();
    expect(screen.queryByText('account.error.usernameTaken')).toBeNull();
  });

  it('keeps a duplicate-email conflict as a form-level error', async () => {
    const register = vi.fn().mockResolvedValue({ status: 409, body: { error: true, msg: 'email_taken' } });
    render(<CreateAccountForm backend={{ register } as never} onSuccess={vi.fn()} />);

    fillAndSubmit();

    await waitFor(() => expect(screen.getByText('account.create.error.duplicate')).toBeTruthy());
    expect(screen.getByLabelText('account.create.username').getAttribute('aria-invalid')).toBeNull();
  });
});
